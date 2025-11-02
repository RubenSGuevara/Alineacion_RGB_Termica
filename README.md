# Registro RGB-Térmica con TPS

Aplicación web para registro y alineación de imágenes RGB y térmicas usando Transformaciones Thin-Plate Splines (TPS).

## 🚀 Características

- ✅ Carga de imágenes RGB y térmicas
- ✅ Marcado interactivo de puntos de control
- ✅ Registro no rígido usando TPS
- ✅ Visualización con superposición ajustable
- ✅ Interfaz moderna con Tailwind CSS
- ✅ Procesamiento en el cliente usando OpenCV.js

## 🛠️ Tecnologías

- **React 19** - Biblioteca de UI
- **Vite** - Build tool y dev server
- **Tailwind CSS** - Estilos
- **OpenCV.js** - Procesamiento de imágenes
- **Lucide React** - Iconos

## 📦 Instalación

```bash
npm install
```

## 🏃 Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## 🏗️ Build para Producción

```bash
npm run build
```

Los archivos optimizados se generarán en la carpeta `dist/`

## 🌐 Despliegue en Vercel

### Opción 1: Despliegue desde GitHub (Recomendado)

1. **Sube tu código a GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <tu-repositorio-github>
   git push -u origin main
   ```

2. **Conecta con Vercel:**
   - Ve a [vercel.com](https://vercel.com)
   - Haz clic en "Add New Project"
   - Selecciona tu repositorio de GitHub
   - Vercel detectará automáticamente que es un proyecto Vite
   - Configuración recomendada:
     - **Framework Preset:** Vite
     - **Build Command:** `npm run build` (automático)
     - **Output Directory:** `dist` (automático)
     - **Install Command:** `npm install` (automático)
   - Haz clic en "Deploy"

3. **¡Listo!** Tu aplicación estará en línea en menos de 2 minutos

### Opción 2: Despliegue con Vercel CLI

1. **Instala Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Despliega:**
   ```bash
   vercel
   ```

3. **Para producción:**
   ```bash
   vercel --prod
   ```

### Configuración Automática

El archivo `vercel.json` ya está configurado con:
- ✅ Detección automática de Vite
- ✅ Rewrites para SPA (Single Page Application)
- ✅ Headers de caché optimizados para OpenCV.js y assets

## 📝 Notas de Despliegue

- **OpenCV.js:** Se carga desde CDN externo (`docs.opencv.org`), por lo que necesita conexión a internet
- **Tamaño del bundle:** OpenCV.js es grande (~8MB), pero se carga de forma asíncrona
- **Build time:** El build normalmente toma 1-2 minutos en Vercel

## 🐛 Solución de Problemas

### El build falla en Vercel
- Verifica que `package.json` tenga el script `build`
- Asegúrate de que todas las dependencias estén listadas en `dependencies` o `devDependencies`

### OpenCV.js no carga
- Verifica la conexión a internet
- Revisa la consola del navegador para errores de carga

### Rutas no funcionan
- El archivo `vercel.json` incluye rewrites para SPA. Si cambias rutas, actualiza las rewrites.

## 📄 Scripts Disponibles

- `npm run dev` - Inicia servidor de desarrollo
- `npm run build` - Construye para producción
- `npm run preview` - Previsualiza el build de producción localmente

## 📚 Documentación Adicional

- [Documentación de Vite](https://vitejs.dev/)
- [Documentación de React](https://react.dev/)
- [Documentación de Vercel](https://vercel.com/docs)
- [OpenCV.js](https://docs.opencv.org/4.5.2/opencv.js-docs/)

## 📝 Licencia

Este proyecto es de uso educativo y de investigación.
