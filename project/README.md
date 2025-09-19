# FIRMWAVE - IoT Device Management System

Sistema completo de gestión de dispositivos IoT (ESP32) con capacidades de actualización Over-The-Air (OTA), comunicación MQTT y monitoreo en tiempo real.

## 🚀 Características

- **Gestión de Dispositivos**: Visualización en tiempo real del estado de dispositivos ESP32
- **Actualización OTA**: Subida y despliegue de firmware a dispositivos remotos
- **Comunicación MQTT**: Integración completa con broker MQTT para mensajería
- **Logs en Tiempo Real**: Sistema de logging con Socket.IO para depuración
- **Base de Datos**: Persistencia con Prisma y PostgreSQL
- **Interface Moderna**: UI responsive basada en el diseño FIRMWAVE

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 14, React, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma ORM
- **Base de Datos**: PostgreSQL
- **Comunicación**: MQTT.js, Socket.IO
- **Autenticación**: NextAuth.js
- **Subida de Archivos**: Multer

## 📋 Prerrequisitos

- Node.js 18+
- PostgreSQL
- Broker MQTT (ej: Mosquitto)

## 🔧 Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <repository-url>
   cd firmwave-iot-management
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   ```
   
   Editar `.env` con tu configuración:
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/iot_management"
   MQTT_BROKER_URL="mqtt://localhost:1883"
   MQTT_USERNAME=""
   MQTT_PASSWORD=""
   NEXTAUTH_SECRET="your-secret-key"
   NEXTAUTH_URL="http://localhost:3000"
   ```

4. **Configurar la base de datos**
   ```bash
   # Generar el cliente Prisma
   npm run db:generate
   
   # Aplicar migraciones
   npm run db:push
   ```

5. **Crear directorio de firmware**
   ```bash
   mkdir -p public/firmware
   ```

## 🚀 Ejecución

### Modo Desarrollo

1. **Iniciar el servidor Next.js**
   ```bash
   npm run dev
   ```

2. **Iniciar servicios de backend** (en otra terminal)
   ```bash
   npm run services
   ```

### Modo Producción

```bash
npm run build
npm start
```

## 📡 Configuración MQTT

### Tópicos MQTT

El sistema se suscribe a los siguientes tópicos:

- `esp32/status` - Estado de dispositivos
- `esp32/heartbeat` - Pulsos de vida
- `esp32/debug` - Logs de depuración  
- `esp32/measurements` - Mediciones de sensores

### Publicación OTA

- `esp32/ota/{mac}` - Actualización para dispositivo específico
- `esp32/ota/all` - Actualización para todos los dispositivos

## 🤖 Integración ESP32

### Formato de mensajes

**Estado del dispositivo (esp32/status):**
```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "name": "ESP32-Device-01",
  "version": "v1.0.0",
  "status": "ONLINE",
  "battery": 85,
  "temperature": 25.5
}
```

**Heartbeat (esp32/heartbeat):**
```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Debug logs (esp32/debug):**
```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "level": "INFO",
  "message": "Sistema iniciado correctamente"
}
```

**Mediciones (esp32/measurements):**
```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "measurements": [
    {
      "type": "temperature",
      "value": 25.5,
      "unit": "°C"
    },
    {
      "type": "humidity",
      "value": 60.2,
      "unit": "%"
    }
  ]
}
```

### Recepción de OTA

El ESP32 debe suscribirse a:
- `esp32/ota/{su_mac}` para actualizaciones específicas
- `esp32/ota/all` para actualizaciones masivas

**Mensaje OTA:**
```json
{
  "url": "http://your-server.com/firmware/firmware-file.bin",
  "version": "v1.1.0",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 🗄️ Estructura de Base de Datos

### Modelos Principales

- **Device**: Información de dispositivos IoT
- **DebugLog**: Logs de depuración y eventos
- **Measurement**: Mediciones de sensores
- **Firmware**: Archivos de firmware subidos

## 📊 API Endpoints

### Dispositivos
- `GET /api/devices` - Listar dispositivos
- `POST /api/devices` - Crear/actualizar dispositivo
- `GET /api/devices/[id]` - Obtener dispositivo específico
- `PUT /api/devices/[id]` - Actualizar dispositivo
- `DELETE /api/devices/[id]` - Eliminar dispositivo

### Logs
- `GET /api/logs` - Obtener logs (con filtros)
- `DELETE /api/logs` - Limpiar todos los logs

### Firmware
- `POST /api/firmware/upload` - Subir archivo de firmware
- `GET /api/firmware/upload` - Listar firmwares disponibles
- `POST /api/firmware/deploy` - Desplegar firmware a dispositivos

## 🔒 Seguridad

- Validación de archivos (solo .bin, tamaño máximo 10MB)
- Autenticación para operaciones críticas
- Sanitización de datos MQTT
- Rate limiting en endpoints de API

## 🐛 Debugging

### Logs del Sistema

- Los logs se muestran en tiempo real en la interfaz
- Se pueden exportar y limpiar desde la UI
- Los logs se persisten en PostgreSQL

### Herramientas de Desarrollo

```bash
# Ver logs de Prisma
npm run db:studio

# Generar tipos después de cambios en esquema
npm run db:generate
```

## 🚀 Despliegue

### Variables de Entorno para Producción

```env
NODE_ENV=production
DATABASE_URL="postgresql://..."
MQTT_BROKER_URL="mqtt://..."
NEXTAUTH_SECRET="secure-random-string"
NEXTAUTH_URL="https://yourdomain.com"
```

### Docker (Opcional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contribución

1. Fork el proyecto
2. Crear una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE.md](LICENSE.md) para detalles.

## 🆘 Soporte

Si encuentras algún problema o tienes preguntas:

1. Revisa la documentación
2. Busca en los issues existentes
3. Crea un nuevo issue con detalles del problema

## 🔄 Roadmap

- [ ] Dashboard con métricas avanzadas
- [ ] Alertas por email/SMS
- [ ] API REST completa
- [ ] Soporte para múltiples tipos de dispositivos
- [ ] Integración con servicios en la nube
- [ ] Autenticación RBAC
- [ ] Backup automático de firmware