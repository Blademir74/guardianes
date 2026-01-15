# 🚀 Deployment a Vercel - Guardianes Guerrero

## 📋 Checklist Pre-Deployment

### ✅ Verificaciones Completadas
- [x] Tests unitarios pasan
- [x] Tests de integración configurados
- [x] Tests de carga listos
- [x] Endpoint `/api/health` funcionando
- [x] Variables de entorno documentadas
- [x] Scripts de reseteo de BD creados

## 🗃️ Base de Datos

### Configuración PostgreSQL
1. **Crear cuenta en Neon.tech** (recomendado)
2. **Crear base de datos** con las tablas del schema
3. **Configurar conexión SSL**
4. **Ejecutar migraciones** si es necesario

### Reseteo de Datos de Producción
```bash
npm run reset-production
```
Este comando limpia:
- Respuestas de encuestas antiguas (>30 días)
- Encuestas de prueba (títulos con 'test', 'prueba', 'demo')
- Actualiza contadores de usuarios
- Limpia sesiones antiguas

## 🔧 Variables de Entorno

Configurar en Vercel Dashboard o CLI:

```bash
vercel env add DATABASE_URL
vercel env add JWT_SECRET
vercel env add ADMIN_JWT_SECRET
```

## 🚀 Deployment

### Paso 1: Instalar Vercel CLI
```bash
npm i -g vercel
vercel login
```

### Paso 2: Deploy
```bash
vercel --prod
```

### Paso 3: Verificar
```bash
curl https://your-app.vercel.app/api/health
```

## 🧪 Testing Post-Deployment

### Tests Unitarios
```bash
npm test
```

### Tests de Integración
```bash
npm run test:integration
```

### Tests de Carga
```bash
npm run test:load
```

## 📊 Monitoreo

### Vercel Analytics
- Automáticamente habilitado en producción
- Métricas de uso y performance

### Health Checks
- `/api/health` para verificación de uptime
- Database connections monitoring
- Error rates tracking

### Logs
```bash
vercel logs
```

## 🔐 Seguridad en Producción

- ✅ HTTPS automático
- ✅ Rate limiting activo
- ✅ CSP configurado
- ✅ Headers de seguridad
- ✅ SQL injection prevention
- ✅ Input validation

## 🚨 Rollback

En caso de problemas:
```bash
vercel rollback
```

## 📞 Soporte

Si hay issues post-deployment:
1. Revisar logs: `vercel logs`
2. Verificar variables de entorno
3. Probar endpoints manualmente
4. Contactar al equipo de desarrollo