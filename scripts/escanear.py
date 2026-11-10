"""Escanea la carpeta compartida de SharePoint/OneDrive y escribe biblioteca.json.

Solo necesita el enlace "cualquiera con el enlace" (scripts/config.json). Usa la
biblioteca estándar de Python, sin instalar nada. Uso:
    python scripts/escanear.py [salida.json]
Si algo falla, termina con error y NO escribe el archivo, para no dejar la biblioteca vacía.
"""
import base64, json, os, sys, time
import urllib.request, urllib.error, urllib.parse
from http.cookiejar import CookieJar

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = json.load(open(os.path.join(RAIZ, "scripts", "config.json"), encoding="utf-8"))
ENLACE = os.environ.get("ENLACE_SHAREPOINT") or CONFIG["enlace_sharepoint"]
SALIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "biblioteca.json")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

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


def main():
    abrir(ENLACE)  # visitar el enlace crea la sesión anónima (cookie)
    sid = "u!" + base64.urlsafe_b64encode(ENLACE.encode()).decode().rstrip("=")
    raiz = api(f"/_api/v2.0/shares/{sid}/driveItem")
    if "folder" not in raiz:
        raise SystemExit("El enlace no apunta a una carpeta.")
    drive = raiz["parentReference"]["driveId"]
    carpetas, archivos = [], []

    def recorrer(item, prefijo):
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
    datos = {"raiz": raiz["name"], "enlace": ENLACE, "folders": carpetas, "files": archivos}
    tmp = SALIDA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, SALIDA)
    print(f"OK: {len(carpetas)} carpetas, {len(archivos)} archivos -> {SALIDA}")


if __name__ == "__main__":
    main()
