"""Escanea la carpeta compartida de SharePoint/OneDrive y escribe biblioteca.json.

Solo necesita el enlace "cualquiera con el enlace" (scripts/config.json). Usa la
biblioteca estándar de Python, sin instalar nada. Uso:
    python scripts/escanear.py [salida.json]            escanea SharePoint (tarda varios minutos)
    python scripts/escanear.py --desde-json completo.json [salida.json]
                                                        re-filtra un escaneo ya hecho (segundos)
Cada escaneo completo se guarda también en .cache/escaneo-completo.json para poder
cambiar los filtros de config.json sin volver a recorrer SharePoint.
Si algo falla, termina con error y NO escribe el archivo, para no dejar la biblioteca vacía.
"""
import base64, json, os, re, sys, time
import urllib.request, urllib.error, urllib.parse
from http.cookiejar import CookieJar

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = json.load(open(os.path.join(RAIZ, "scripts", "config.json"), encoding="utf-8"))
ENLACE = os.environ.get("ENLACE_SHAREPOINT") or CONFIG["enlace_sharepoint"]
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
CACHE = os.path.join(RAIZ, ".cache", "escaneo-completo.json")

# Filtros (editables en config.json)
EXTENSIONES = {e.lower() for e in CONFIG.get("extensiones_incluidas", [])}
EXCLUIR = [re.compile(p, re.I) for p in CONFIG.get("excluir_carpetas", [])]
PROFUNDIDAD_MAX = CONFIG.get("profundidad_maxima")  # número de carpetas bajo la raíz, o null


def carpeta_excluida(nombre):
    return any(r.search(nombre) for r in EXCLUIR)


def archivo_aceptado(path):
    """path relativo a la raíz, con '/'."""
    partes = path.split("/")
    if any(carpeta_excluida(p) for p in partes[:-1]):
        return False
    if PROFUNDIDAD_MAX is not None and len(partes) - 1 > PROFUNDIDAD_MAX:
        return False
    nombre = partes[-1]
    if nombre.startswith(("~$", ".")):
        return False
    if EXTENSIONES and os.path.splitext(nombre)[1].lower() not in EXTENSIONES:
        return False
    return True


def escribir(datos, salida):
    datos["folders"] = [c for c in datos["folders"] if not carpeta_excluida(c)]
    datos["files"] = [a for a in datos["files"] if archivo_aceptado(a["path"])]
    tmp = salida + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"raiz": datos["raiz"], "folders": datos["folders"], "files": datos["files"]},
                  f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, salida)
    print(f"OK: {len(datos['folders'])} carpetas, {len(datos['files'])} archivos -> {salida}")


def escanear_sharepoint():
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    opener.addheaders = [("User-Agent", UA)]
    origen = "{0.scheme}://{0.netloc}".format(urllib.parse.urlparse(ENLACE))

    def abrir(url, headers=None, intentos=4):
        for i in range(intentos):
            try:
                req = urllib.request.Request(url, headers=headers or {})
                with opener.open(req, timeout=60) as r:
                    return r.read()
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and i < intentos - 1:
                    time.sleep(2 ** (i + 1)); continue
                raise
            except urllib.error.URLError:
                if i < intentos - 1:
                    time.sleep(2 ** (i + 1)); continue
                raise

    def api(ruta):
        url = ruta if ruta.startswith("http") else origen + ruta
        return json.loads(abrir(url, {"Prefer": "autoredeem", "Accept": "application/json"}))

    def hijos(drive, item):
        url = f"/_api/v2.0/drives/{drive}/items/{item}/children?$top=200"
        while url:
            pagina = api(url)
            yield from pagina.get("value", [])
            url = pagina.get("@odata.nextLink")

    abrir(ENLACE)  # visitar el enlace crea la sesión anónima (cookie)
    sid = "u!" + base64.urlsafe_b64encode(ENLACE.encode()).decode().rstrip("=")
    raiz = api(f"/_api/v2.0/shares/{sid}/driveItem")
    if "folder" not in raiz:
        raise SystemExit("El enlace no apunta a una carpeta.")
    drive = raiz["parentReference"]["driveId"]
    carpetas, archivos = [], []

    def recorrer(item, prefijo):
        print(f"  ... {prefijo or '/'}  ({len(archivos)} archivos hasta ahora)", flush=True)
        for it in hijos(drive, item):
            nombre = it["name"]
            if "folder" in it:
                if not prefijo:
                    carpetas.append(nombre)
                recorrer(it["id"], prefijo + nombre + "/")
            elif not nombre.startswith(("~$", ".")):
                archivos.append({
                    "path": prefijo + nombre,
                    "modified": it.get("lastModifiedDateTime"),
                    "size": it.get("size"),
                    "webUrl": it.get("webUrl"),
                })

    recorrer(raiz["id"], "")
    carpetas.sort(key=str.casefold)
    archivos.sort(key=lambda a: a["path"].casefold())
    return {"raiz": raiz["name"], "folders": carpetas, "files": archivos}


def main():
    args = sys.argv[1:]
    if args and args[0] == "--desde-json":
        origen = args[1]
        salida = args[2] if len(args) > 2 else os.path.join(RAIZ, "biblioteca.json")
        datos = json.load(open(origen, encoding="utf-8"))
    else:
        salida = args[0] if args else os.path.join(RAIZ, "biblioteca.json")
        datos = escanear_sharepoint()
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        with open(CACHE, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))
    escribir(datos, salida)


if __name__ == "__main__":
    main()
