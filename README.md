# Localizador DWG Web

Aplicación web para cargar y visualizar planos DWG, buscar textos, códigos, números, bloques o atributos y llevar la vista directamente a la coincidencia. Incluye zoom automático, marcador animado, lista de resultados, navegación anterior/siguiente y panel de detalles.

## Archivo incluido

El proyecto contiene:

- `sample/L_FEB26.DWG`
- Formato detectado: AutoCAD 2010/2011/2012 (`AC1024`)
- Tamaño aproximado: 623 KB

## Qué hace

1. Envía el DWG a Autodesk Platform Services (APS).
2. APS lo convierte a SVF2 para mostrarlo en el navegador.
3. El visor carga la geometría, textos y propiedades del plano.
4. El buscador combina dos métodos:
   - **Textos 2D extraídos:** localiza el cuadro exacto de cada texto visible.
   - **Propiedades CAD:** busca nombres, códigos, bloques, atributos y demás metadatos.
5. Al elegir una coincidencia, centra la vista, la resalta cuando corresponde y coloca un apuntador animado en su posición.

## Requisito importante

Un navegador no interpreta de manera nativa un archivo DWG. Esta versión usa Autodesk Platform Services, por lo que necesitas crear una aplicación APS y obtener:

- `APS_CLIENT_ID`
- `APS_CLIENT_SECRET`

Nunca coloques `APS_CLIENT_SECRET` dentro de `public/`, HTML o JavaScript del navegador.

## Instalación en Windows

### 1. Instalar Node.js

Instala Node.js 18 o superior. Se recomienda una versión LTS.

### 2. Preparar las credenciales

Copia `.env.example`, pega la copia en la misma carpeta y renómbrala como `.env`.

Contenido:

```env
APS_CLIENT_ID=TU_CLIENT_ID
APS_CLIENT_SECRET=TU_CLIENT_SECRET
APS_BUCKET=
PORT=8080
```

`APS_BUCKET` puede quedar vacío. El sistema genera uno automáticamente a partir del Client ID.

### 3. Instalar y ejecutar

Abre una terminal dentro de la carpeta del proyecto y ejecuta:

```bash
npm install
npm start
```

Luego abre:

```text
http://localhost:8080
```

### 4. Abrir el plano incluido

Pulsa **Cargar L_FEB26.DWG**. La primera conversión se realiza en la nube y puede tardar. Después, el archivo queda disponible en el selector de planos.

## Cómo buscar

1. Escribe un valor en el buscador.
2. Pulsa **Buscar**.
3. La web mostrará las coincidencias encontradas.
4. Usa las flechas para pasar de una coincidencia a otra.
5. El visualizador hará zoom y pondrá un marcador sobre el resultado.

La opción **Exigir coincidencia exacta** evita coincidencias parciales.

## Formatos admitidos

- DWG
- DXF
- RVT
- IFC
- NWD
- NWC
- PDF

## Estructura

```text
DWG_Buscador_Web/
├── config.js
├── package.json
├── package-lock.json
├── server.js
├── routes/
│   ├── auth.js
│   └── models.js
├── services/
│   └── aps.js
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── viewer.js
│   ├── search.js
│   └── app.js
└── sample/
    └── L_FEB26.DWG
```

## Verificación incluida

```bash
npm run check
```

Este comando comprueba la sintaxis de los archivos JavaScript del servidor y del navegador.

## Consideraciones del buscador

El buscador de textos funciona cuando el valor fue conservado como texto durante la traducción del DWG. Si una palabra o número está explotado y convertido solamente en líneas o curvas, ya no existe como texto semántico; en ese caso se necesitaría reconocimiento visual adicional o corregir el archivo CAD.

## Privacidad

Esta implementación procesa los planos mediante Autodesk Platform Services. Para planos confidenciales que no deban salir de una red privada, se necesita una solución privada con un SDK DWG autorizado o una conversión controlada dentro de la infraestructura de la empresa.
