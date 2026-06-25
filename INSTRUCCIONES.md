# Localizador DWG Web — Instrucciones de despliegue en Render.com

## Pasos (sin instalar nada en tu PC)

### 1. Sube el proyecto a GitHub

1. Ve a https://github.com y crea cuenta si no tienes
2. Clic en "New repository" → nombre: `dwg-visor` → Create
3. En tu PC, abre el repositorio y sube todos estos archivos
   (puedes usar la opción "Upload files" directo desde GitHub)

### 2. Despliega en Render.com (gratis)

1. Ve a https://render.com y crea cuenta
2. Clic en "New +" → "Web Service"
3. Conecta tu repositorio de GitHub `dwg-visor`
4. Configura:
   - Name: dwg-visor
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
5. En "Environment Variables" agrega:
   - `APS_CLIENT_ID` = tu Client ID de Autodesk
   - `APS_CLIENT_SECRET` = tu Client Secret de Autodesk
6. Clic "Create Web Service"
7. Render te dará una URL tipo: https://dwg-visor.onrender.com

### 3. Usa tu app

Abre la URL que te dio Render en cualquier navegador.
No necesitas instalar Node.js ni nada en tu PC.

## Credenciales Autodesk APS

Obtén las tuyas en: https://aps.autodesk.com
→ Sign In → My Apps → Create App
→ Copia Client ID y Client Secret
