# 🚀 Deployment Completo en Vercel - Guardianes Guerrero

## 📋 Checklist Pre-Deployment

### ✅ Verificaciones Obligatorias
- [x] Base de datos Neon configurada y probada
- [x] Variables de entorno en `.env`
- [x] Tests unitarios pasan (`npm test`)
- [x] Tests de integración pasan (`npm run test:integration`)
- [x] Script de reseteo ejecutado (`npm run reset-production`)

---

## 🚀 PASO 1: Preparación Local

### Ejecutar verificación pre-deployment

```bash
npm run pre-deploy
```

**Salida esperada:**
```
✅ Archivo .env encontrado
✅ Variables de entorno configuradas
✅ Conexión a BD exitosa
✅ Tests unitarios pasaron
✅ Archivos críticos verificados
🎉 ¡Preparación completada! Listo para deploy en Vercel
```

---

## 🚀 PASO 2: Configuración de Vercel

### Instalar Vercel CLI

```bash
npm install -g vercel
```

### Login en Vercel

```bash
vercel login
```

**Nota:** Se abrirá el navegador para autenticación.

### Configurar proyecto (primera vez)

```bash
# En la carpeta backend/
vercel

# Responder las preguntas:
# - ¿Quieres configurar/vercel-project? y
# - ¿Cuál es tu código? ./src/server.js
# - ¿Quieres modificar configuración? n (usará vercel.json)
```

---

## 🚀 PASO 3: Configurar Variables de Entorno en Vercel

### Opción A: Usar Vercel CLI (Recomendado)

```bash
# Configurar cada variable
vercel env add DATABASE_URL
vercel env add JWT_SECRET
vercel env add ADMIN_JWT_SECRET

# Para producción
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production
vercel env add ADMIN_JWT_SECRET production
```

### Opción B: Usar Vercel Dashboard

1. **Ir a** [vercel.com/dashboard](https://vercel.com/dashboard)
2. **Seleccionar** tu proyecto
3. **Ir a** Settings → Environment Variables
4. **Agregar** cada variable con sus valores

**Variables requeridas:**
- `DATABASE_URL`: Connection string de Neon
- `JWT_SECRET`: Secreto JWT (mínimo 32 caracteres)
- `ADMIN_JWT_SECRET`: Secreto admin JWT (diferente al anterior)
- `NODE_ENV`: `production`

---

## 🚀 PASO 4: Deploy a Producción

### Ejecutar deployment

```bash
npm run vercel-deploy
```

**O directamente:**
```bash
vercel --prod
```

### Esperar el proceso
- Vercel construirá la aplicación
- Subirá los archivos
- Configurará el dominio
- **Tiempo aproximado:** 2-5 minutos

### Salida esperada:
```
✅ Production deployment ready
🔗 https://tu-proyecto.vercel.app
```

---

## 🚀 PASO 5: Verificación Post-Deployment

### Configurar VERCEL_URL

```bash
# Agregar la URL de Vercel a variables de entorno
export VERCEL_URL=https://tu-proyecto.vercel.app
```

### Ejecutar verificación automática

```bash
npm run post-deploy
```

**Salida esperada:**
```
🔍 [POST-DEPLOY] Verificando aplicación en: https://tu-proyecto.vercel.app

📡 Probando Health Check: https://tu-proyecto.vercel.app/api/health
✅ Health Check: 200 - ok

📡 Probando Lista Municipios: https://tu-proyecto.vercel.app/api/data/municipios
✅ Lista Municipios: 200 - OK

📡 Probando Encuestas Activas: https://tu-proyecto.vercel.app/api/surveys/active
✅ Encuestas Activas: 200 - OK

📡 Probando Participación Municipio 1: https://tu-proyecto.vercel.app/api/data/participacion/1
✅ Participación Municipio 1: 200 - OK

📡 Probando Comparación Municipio 1: https://tu-proyecto.vercel.app/api/data/comparacion/1
✅ Comparación Municipio 1: 200 - OK

📊 Resultados:
✅ Exitosos: 5
❌ Fallidos: 0

🎉 ¡Todas las verificaciones pasaron! La aplicación está lista.
```

---

## 🚀 PASO 6: Configuración Final

### Actualizar URLs en Frontend

Si tienes frontend separado, actualiza las URLs:

```javascript
// Cambiar de localhost:3000 a tu URL de Vercel
const API_URL = 'https://tu-proyecto.vercel.app';
```

### Configurar Dominio Personalizado (Opcional)

1. **Ir a** Vercel Dashboard → Tu proyecto → Settings
2. **Ir a** Domains
3. **Agregar** tu dominio personalizado
4. **Configurar** DNS según las instrucciones

### Configurar Analytics (Recomendado)

1. **Ir a** Vercel Dashboard → Tu proyecto
2. **Ir a** Analytics
3. **Habilitar** Vercel Analytics

---

## 📊 Monitoreo Inicial

### Verificar Logs

```bash
# Ver logs en tiempo real
vercel logs

# Ver logs de una deployment específica
vercel logs --follow
```

### Ejecutar Tests de Carga

```bash
npm run test:load
```

### Monitorear Base de Datos

- **Neon Dashboard**: Ver conexiones y queries
- **Vercel Dashboard**: Ver métricas de uso

---

## 🚨 Troubleshooting

### Error: "Build failed"
```bash
# Ver logs detallados
vercel build --debug

# Limpiar cache
vercel rm
```

### Error: "Database connection failed"
- Verificar `DATABASE_URL` en Vercel
- Asegurar que Neon permite conexiones externas
- Verificar que la BD no esté en pausa

### Error: "JWT token invalid"
- Verificar que `JWT_SECRET` y `ADMIN_JWT_SECRET` estén configurados
- Asegurar que sean diferentes entre sí

### Error: "Module not found"
```bash
# Limpiar node_modules y reinstallar
rm -rf node_modules package-lock.json
npm install
```

---

## 🎯 Checklist Post-Deployment

- [ ] ✅ Deployment exitoso en Vercel
- [ ] ✅ Variables de entorno configuradas
- [ ] ✅ Todas las verificaciones pasaron
- [ ] ✅ Health check responde correctamente
- [ ] ✅ Base de datos conectada
- [ ] ✅ Logs funcionando
- [ ] ✅ Dominio configurado (opcional)
- [ ] ✅ Analytics habilitado (recomendado)

---

## 📞 Próximos Pasos

1. **Monitorear** la aplicación por 24-48 horas
2. **Configurar** alertas en Vercel
3. **Documentar** cualquier issue encontrado
4. **Planificar** mejoras basadas en métricas

¿Necesitas ayuda con algún paso específico del deployment? 🚀