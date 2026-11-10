# Biblioteca Documental – puesta en marcha (una sola vez)

La página se publica en **GitHub Pages** y se actualiza sola. Cada 15 minutos un proceso de GitHub
lee la carpeta compartida de SharePoint (carpetas y archivos) y vuelve a publicar la página.
No hay que instalar nada ni ejecutar nada en ninguna computadora.

## Instalación

1. Crea un repositorio en GitHub (por ejemplo `biblioteca-documental`).
2. Sube **todo el contenido de esta carpeta** respetando las subcarpetas (`.github`, `scripts`, etc.). En la página del repositorio: *Add file → Upload files*, y arrastra todo. Si el navegador no sube `.github`, usa GitHub Desktop.
3. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. En la pestaña **Actions**, abre "Actualizar y publicar biblioteca" y pulsa **Run workflow**. A los 2 minutos la página queda en `https://<usuario>.github.io/<repositorio>/`.

Desde ahí se actualiza sola. Para actualizar al instante: *Actions → Run workflow*.

## Cambiar la carpeta de SharePoint
Edita `scripts/config.json` y cambia `enlace_sharepoint`. El enlace debe ser de tipo
"cualquiera con el enlace puede ver".

## Cómo funciona la estructura
- Cada carpeta de primer nivel es una categoría (NOM, REGLAMENTOS, PROCEDIMIENTOS, …).
- La subcarpeta siguiente es el "Área".
- Una carpeta con "Colaboradores", "Interno" o "Confidencial" en el nombre marca sus documentos como acceso Colaboradores.
- Si se agregan, renombran o eliminan carpetas, la biblioteca cambia sola en el siguiente ciclo.

## Si algo falla
- *Actions* muestra una ✗ roja: abre la ejecución y lee el error. Mientras falle, la página anterior sigue publicada.
- Si GitHub no muestra ejecuciones automáticas, pulsa *Run workflow* una vez (GitHub desactiva los programadores tras 60 días sin actividad; el flujo incluye un mantenimiento para evitarlo).
