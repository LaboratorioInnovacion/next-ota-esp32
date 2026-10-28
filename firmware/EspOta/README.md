# Configurar una estación meteorológica, paso a paso

Esta guía explica cómo preparar **una estación piloto**, encenderla, conectarla al
WiFi desde un teléfono y comprobar que sus mediciones llegan a los paneles. Use
**el archivo `EspOta.ino` de esta carpeta**, no otro programa del repositorio.
Si la placa ya tiene este firmware preparado, comience en el **paso 4** con la
contraseña de configuración proporcionada por la persona responsable.

**Recorrido esperado:** encendido → lectura de configuración guardada → conexión
a una red conocida o apertura del portal → configuración desde el teléfono →
conexión y confirmación de guardado → primera medición válida enviada →
comprobación en los paneles → funcionamiento periódico y prueba de reinicio.

> **Seguridad física:** si la placa o el sensor se calientan de forma inusual,
> desconecte la alimentación y revise el montaje antes de volver a conectarlos.
> Esta guía no determina la causa del calentamiento ni certifica que una
> actualización de firmware lo resuelva.

## 1. Preparar los archivos y el equipo

1. Descargue y extraiga el repositorio, o utilice una copia local completa.
   Conserve **toda la carpeta `firmware/EspOta/`**: el programa necesita sus
   archivos `.cpp`, `.h` y los recursos generados del portal. Descargar solamente
   `EspOta.ino` no es suficiente.
2. Identifique la placa ESP32 exacta, su memoria flash, la versión del núcleo
   Arduino-ESP32, las bibliotecas instaladas y la distribución de particiones
   compatible con OTA. La inscripción del módulo no basta para decidir estos
   valores. Use el procedimiento documentado para su placa; aquí no se prescribe
   un perfil de placa ni un esquema de particiones sin verificar.
3. El programa selecciona **DHT11 en GPIO15** (`DHTTYPE` y `DHTPIN`). Con la
   alimentación desconectada, contraste el cableado con la documentación de la
   placa y del sensor concretos. No se establece aquí una tensión de alimentación
   ni una distribución de terminales segura para un módulo no identificado.
4. Prepare una red **WiFi de 2,4 GHz con WPA personal**, su nombre exacto y su
   contraseña, un teléfono y acceso al puerto serie físico. El programa utiliza
   las bibliotecas DHT y PubSubClient; sus versiones deben corresponder al entorno
   de compilación utilizado.

La guía describe el código del repositorio, no un binario certificado. Quedan por
validar con la placa real la compilación, el tamaño del binario y su compatibilidad
con las particiones OTA, el montaje y el comportamiento con teléfonos y redes.
Realice primero la prueba piloto, antes de preparar varias estaciones.

## 2. Definir los valores iniciales de esta estación

Abra [EspOta.ino](EspOta.ino) y modifique las constantes existentes cerca del
inicio; **no agregue un segundo conjunto de definiciones**. Este ejemplo contiene
datos sintéticos, no una ubicación de instalación:

```cpp
constexpr float DEFAULT_LATITUDE = 12.5f;
constexpr float DEFAULT_LONGITUDE = -45.25f;
constexpr char STATION_NAME[] = "Estacion piloto";
constexpr char STATION_MAC_OVERRIDE[] = "";
constexpr uint32_t DEFAULT_SEND_INTERVAL_SECONDS = 300;
```

| Constante | Qué significa y qué indicar |
| --- | --- |
| `STATION_NAME` | Nombre de respaldo de la estación: entre 1 y 64 bytes UTF-8, sin caracteres de control. Una letra acentuada puede ocupar más de un byte. |
| `DEFAULT_LATITUDE` | Latitud real, finita, entre −90 y 90. |
| `DEFAULT_LONGITUDE` | Longitud real, finita, entre −180 y 180. |
| `STATION_MAC_OVERRIDE` | Normalmente vacío: así se usa la MAC WiFi física como identificador de la estación en HTTP. |
| `DEFAULT_SEND_INTERVAL_SECONDS` | Intervalo de envío meteorológico en segundos enteros, entre 60 y 86400. El valor predeterminado es 300: cinco minutos **entre envíos exitosos posteriores**, no antes del primer envío. |

La temperatura se obtiene en grados Celsius y la humedad en porcentaje. Estos
campos no son ajustes de calibración; el portal configura red y metadatos, no
calibra el DHT11.

### Identidad, nombre e historial

Cada placa nueva debe tener una identidad única. Utilice una MAC alternativa
solo para conservar deliberadamente la identidad de una estación ya existente.
Su formato es de seis octetos hexadecimales separados por dos puntos. Si es
inválida, se informa por serie y se utiliza la MAC física.

El servidor identifica estaciones por la **cadena MAC exacta, incluidas sus
mayúsculas y minúsculas**. Cambiarla puede crear otra estación; repetir la misma
en dos placas mezcla sus lecturas. Para una identidad nueva compartida con
diagnósticos, utilice mayúsculas, pues los diagnósticos normalizan la MAC por
separado.

La alternativa afecta solamente al JSON HTTP meteorológico y de diagnóstico:
no cambia la MAC de radio, el sufijo de la red de configuración, la identidad
MQTT ni el destino OTA. Con la misma MAC HTTP, un nombre meteorológico no vacío
actualiza la estación existente en la siguiente lectura aceptada y conserva su
historial. Si el servidor recibe un nombre vacío, conserva el nombre existente;
**dejar vacío el nombre del portal tiene otro significado**: vuelve a `STATION_NAME`.

### Prioridad de la configuración guardada

Los valores guardados desde el portal prevalecen sobre estas constantes. La
memoria persistente **NVS** conserva la configuración entre reinicios y normalmente
también al cargar firmware sin un borrado explícito. Cambiar una constante no
elimina una sustitución guardada.

Para volver a los valores del firmware, cuando el portal esté disponible, envíe
y guarde correctamente el formulario con el nombre, **ambas** coordenadas y el
intervalo vacíos. Esto no borra las redes WiFi. No borre toda la memoria flash
como procedimiento habitual de configuración.

## 3. Preparar las contraseñas y la autorización del servidor

Coordine esta parte con quien prepara el firmware y administra los servicios.
No publique contraseñas, tokens ni capturas que los contengan.

| Credencial | Para qué se usa |
| --- | --- |
| Contraseña del punto de acceso de la estación | Permite que el teléfono se conecte a `estacionm-nodo-xxxx`. No es la contraseña del router. |
| Contraseña del router | Se introduce en el portal para que el ESP32 acceda a la red con Internet. |
| Credencial compartida configurada en el firmware | En el diseño actual, también autoriza los envíos meteorológicos mediante `Authorization: Bearer …`. |
| `ESP32_AUTH_TOKEN` del servidor | Debe coincidir con la credencial compartida meteorológica en **cada** servicio receptor. No se introduce en el portal. |
| Token de diagnósticos | Es independiente; no sustituye ninguna de las credenciales anteriores. |

La selección de la contraseña del punto de acceso se configura en
[SetupConfig.h](SetupConfig.h), mediante
`provisioning::TemporarySharedSetupPassword`. Consulte su configuración de forma
privada, sin copiar su valor a documentación, incidencias o registros compartidos:

- Si tiene un valor válido no vacío, de 8 a 63 bytes ASCII imprimibles, este
  prevalece sobre cualquier contraseña aleatoria guardada. Solicítelo a la persona
  que preparó el firmware; **no se imprime por serie**.
- Si está vacío, se utiliza una contraseña aleatoria persistente por dispositivo.
  Se informa únicamente en la consola serie física cuando se abre el portal;
  regístrela de forma privada.
- Si el valor configurado no vacío es inválido, el portal no se habilita.
  **No existe una alternativa de punto de acceso abierto o sin contraseña.**

Para la credencial compartida de configuración y envío meteorológico, use entre
8 y 63 bytes ASCII imprimibles **sin espacios**: el punto de acceso admite
espacios, pero la validación del token Bearer del servidor no. Sustituya cualquier
credencial de pruebas de forma privada antes de instalar las estaciones.

**Acoplamiento importante:** los envíos meteorológicos usan la credencial
compartida configurada, nunca la contraseña aleatoria persistente del punto de
acceso. En modo aleatorio, con el valor compartido vacío, el firmware omite esa
cabecera y no puede autenticarse ante el servidor protegido actual.

El operador debe configurar el mismo `ESP32_AUTH_TOKEN` en el entorno seguro de
cada receptor: **Production** para el servicio de Vercel y el entorno del servicio
en el VPS para el otro destino. No debe ser una variable pública del navegador.
Esta es una condición previa, no una instrucción para desplegar servicios ni
modificar bases de datos durante la configuración de la estación.

> **Limitación de transporte:** la ruta HTTPS meteorológica actual no proporciona
> una CA de confianza para autenticar al servidor. MQTT también utiliza una
> configuración TLS insegura. Existe riesgo de suplantación y exposición de la
> credencial compartida; esta guía no corrige ni certifica esa seguridad.

## 4. Cargar el programa y encender la estación

Si el firmware ya está cargado, no es necesario volver a cargarlo para introducir
la red desde el teléfono.

1. Para una placa pendiente de preparar, abra **`firmware/EspOta/EspOta.ino`** en
   su entorno ESP32. Compile para la placa, núcleo, bibliotecas y particiones
   reales; compruebe el tamaño resultante antes de cargarlo.
2. Utilice el procedimiento de carga documentado para esa placa y preserve NVS,
   salvo mantenimiento separado y autorizado. Editar este README no compila ni
   carga firmware y no modifica el programa ya instalado.
3. Abra el monitor serie a **115200 baudios** y alimente la estación. Compruebe el
   inicio y registre de forma privada la línea `MAC:` para contrastar la identidad.
4. Al arrancar, el programa inicializa el DHT11, carga desde NVS las redes y las
   sustituciones de nombre, ubicación e intervalo, y comienza a intentar conexión.
   Primero prueba las redes guardadas y después las alternativas válidas
   incluidas al compilar.
5. Si conecta a una red conocida, continúa con el funcionamiento normal y
   **puede no abrir ninguna red de configuración**. Pase al paso 7 para comprobar
   los envíos. Si no hay redes válidas o falla el ciclo de redes conocidas, intenta
   abrir el portal; busque `Local setup AP:` en serie y continúe en el paso 5.

Cada intento de asociación a una red conocida dispone de 10 segundos, además de
la transición de desconexión. Tras agotar un ciclo fallido, espera 30 segundos
antes de iniciar otro. No hay un único plazo de apertura del portal aplicable a
todas las placas: depende de cuántas redes conozca y de su estado.

### Opcional: inicio limpio / borrar configuración con Arduino IDE

> **Advertencia: operación destructiva, no necesaria para una actualización normal.**
> Úsela solo si desea eliminar deliberadamente toda la configuración local y
> volver a preparar la placa. No borra únicamente el WiFi: elimina todo el
> contenido de la memoria flash, incluida la aplicación anterior, la tabla de
> particiones, NVS y cualquier sistema de archivos presente. La carga posterior
> vuelve a instalar el programa, pero no recupera los datos persistentes borrados.

Se pierden los SSID y contraseñas WiFi guardados, las sustituciones de nombre,
ubicación e intervalo de envío y cualquier credencial del punto de acceso
almacenada en NVS. Antes de continuar, conserve de forma segura los ajustes y
credenciales necesarios para configurar de nuevo la estación; este firmware no
ofrece una función de exportación o copia de seguridad. No copie contraseñas ni
tokens en este README ni en otros documentos públicos.

1. Abra **`firmware/EspOta/EspOta.ino`** en Arduino IDE y compruebe los valores y
   credenciales que se incluirán al compilar. Seleccione la **placa exacta y su
   puerto**; revise núcleo, tamaño de flash y particiones como en el paso 1.
2. En **Herramientas → «Erase All Flash Before Sketch Upload» → «Enabled»**,
   active el borrado previo a la carga. La disponibilidad del ajuste depende de
   la placa seleccionada y de la versión del núcleo Arduino-ESP32. Si no aparece,
   consulte la documentación de esa combinación antes de continuar; no suponga
   que existe un botón independiente de borrado.
3. Compile y cargue ese sketch en la **placa y el puerto seleccionados** mediante
   el procedimiento compatible con su placa. El borrado se realiza antes de la
   carga; seleccionar «Enabled» por sí solo no lo ejecuta.
4. Después de la primera carga limpia, vuelva a **Herramientas →
   «Erase All Flash Before Sketch Upload» → «Disabled»** para las actualizaciones
   normales que deban conservar NVS. Revise el ajuste si cambia de placa o núcleo;
   no dé por hecho que conserva la selección anterior.
5. Abra el monitor serie a **115200 baudios** y continúe con los pasos 5 y 6 si
   se abre el portal. Sin una contraseña compartida compilada, se genera y guarda
   una nueva contraseña aleatoria al abrirlo: obténgala de nuevo por serie de
   forma privada. Con una contraseña compartida válida compilada, esta sigue
   teniendo prioridad y no se imprime por serie. Las redes alternativas
   compiladas también siguen disponibles y pueden evitar que se abra el portal.

El borrado no modifica los archivos fuente: los valores predeterminados,
contraseñas o tokens incluidos en el sketch se incorporan de nuevo al compilar y
cargar. Tampoco modifica los eFuses ni la MAC física del dispositivo, ni constituye
una garantía de borrado seguro irrecuperable. No elimina estaciones, bases de
datos ni historial en el VPS o Vercel; con la misma identidad HTTP, los envíos
posteriores siguen asociados a la estación existente.

**Referencia oficial:** [Arduino-ESP32: «Erase All Flash Before Sketch Upload»](https://docs.espressif.com/projects/arduino-esp32/en/latest/guides/tools_menu.html#erase-all-flash-before-sketch-upload).
Espressif documenta «Disabled» como valor predeterminado y «Enabled» para borrar
todo el contenido de flash antes de cargar. Esta sección solo describe el
procedimiento: editar la guía no ejecuta borrados ni cargas.

## 5. Conectar el teléfono al WiFi del ESP32 y abrir el portal

1. Abra los **ajustes WiFi del teléfono**. Seleccione la red
   **`estacionm-nodo-xxxx`** anunciada por la placa. `xxxx` son los cuatro dígitos
   hexadecimales en minúscula de los últimos dos bytes de su MAC física; el sufijo
   no es globalmente único y no cambia al editar el nombre de la estación.
2. Introduzca la **contraseña de configuración de la estación** obtenida en el
   paso 3, no la del router. El punto de acceso admite un cliente a la vez.
3. Si el teléfono advierte que esta red **no tiene Internet**, elija permanecer
   conectado. Es normal: se está comunicando directamente con el ESP32. Si el
   teléfono cambia automáticamente a datos móviles u otra red, mantenga esta
   conexión local durante el trámite; no es necesario desactivar protecciones
   globales del dispositivo.
4. Espere la ventana de acceso cautivo. Si no aparece, abra el navegador y escriba
   **`http://192.168.4.1`**, con `http`, **no `https`**. Debe estar conectado al WiFi
   del ESP32, no solamente al del router.
5. Compruebe el encabezado **«Conecte su estación»**. El DNS cautivo y el servidor
   local funcionan solo en el punto de acceso de la estación mientras está activo;
   esta dirección no es un panel permanente accesible desde la red del router.

El DNS privado o el navegador pueden impedir la apertura automática; use la
dirección HTTP manual. Si el propio teléfono proporciona la red de Internet,
puede necesitar otro teléfono o una computadora para conectarse al ESP32.
Mantenga el punto de acceso del teléfono encendido y visible. Evite una red de
origen `192.168.4.0/24`, pues entra en conflicto con la subred de configuración.

## 6. Completar cada campo y confirmar la conexión

El portal combina textos en español e inglés. A continuación se conservan sus
**etiquetas visibles exactas**, para que pueda reconocerlas sin traducirlas
mentalmente. No hay búsqueda automática de redes ni carga de fotografías de QR:
la red y los demás datos se introducen manualmente.

### 6.1 Revisar los campos en el orden de la página

1. **«Nombre de la estación (opcional)»**: indique un nombre reconocible para el
   panel. Acepta hasta 64 bytes UTF-8 y rechaza caracteres de control; se quitan
   los espacios ASCII al inicio y al final. Solo se completa automáticamente si
   existe un nombre guardado desde el portal, no con `STATION_NAME`. Si lo deja
   vacío y guarda correctamente, elimina esa sustitución y usa `STATION_NAME`.
2. **«Weather send interval in seconds (optional)»**: es el intervalo de envío
   meteorológico, **en segundos**. Por ejemplo, `300` son cinco minutos y `60` un
   minuto. Acepta enteros decimales entre **60 y 86400**, sin signos, decimales ni
   exponentes. El campo muestra solamente la sustitución guardada; si no existe,
   aparece vacío. La ayuda muestra por separado el intervalo efectivo actual y
   el predeterminado del firmware. Dejarlo vacío y guardar correctamente elimina
   la sustitución y aplica `DEFAULT_SEND_INTERVAL_SECONDS`, tanto en ese momento
   como después de reiniciar. **No retrasa el primer envío cinco minutos.**
3. **«Nombre de la red (SSID)»**: escriba el nombre exacto del router o del punto
   de acceso que dará Internet al ESP32. Respete espacios, mayúsculas y minúsculas.
   Es obligatorio y admite entre 1 y 32 bytes, sin caracteres de control.
4. **«Contraseña del router»**: escriba la contraseña de esa red, no la de la
   estación. Es obligatoria y admite de 8 a 63 caracteres ASCII imprimibles.
   No se admiten redes abiertas ni claves PSK de 64 dígitos hexadecimales.
5. **«Mostrar contraseña»**: es un **botón**, no una casilla. Permite revisar lo
   escrito y cambia a **«Ocultar contraseña»** para ocultarlo de nuevo. Requiere
   JavaScript; si no aparece, el campo sigue siendo de contraseña.
6. Bajo **«Ubicación de la estación (opcional)»**, complete **«Latitud»** y
   **«Longitud»** juntas. Use grados decimales con punto: latitud de −90 a 90 y
   longitud de −180 a 180. No use coma decimal, notación exponencial o hexadecimal.
   Cero es una coordenada válida. La página no solicita GPS.
   **Las coordenadas nunca se rellenan automáticamente**: vuelva a introducir
   ambas si quiere conservar una ubicación personalizada. Dejarlas ambas vacías
   elimina la pareja guardada y utiliza los valores del firmware tras guardar
   correctamente; completar solo una se rechaza.

El formulario incluye un campo `token` **oculto y automático**, ligado a la
ventana del portal. No debe rellenarlo, buscarlo ni pegar allí el token del
servidor. No es la contraseña WiFi ni la autorización meteorológica.

### 6.2 Pulsar el botón y distinguir recepción, conexión y guardado

1. Revise **todos** los campos, especialmente las coordenadas vacías. Pulse una
   vez **«Probar y agregar red»**. Con JavaScript, el estado cambia a
   **«Enviando para probar la conexión…»** y se deshabilita el botón mientras se envía.
2. Si hay un error de formato, corrija el campo indicado. Una solicitud aceptada
   muestra **«Solicitud recibida»**, con el título **«Probando conexión»**.
   Esto solo confirma que se recibió la petición; **no confirma el guardado**.
3. Espere unos **15 segundos** como orientación para la prueba de conexión.
   La asociación tiene un límite de 10 segundos, además de las transiciones.
   La red se intenta guardar únicamente después de una conexión nueva correcta;
   los metadatos se guardan después de confirmar el almacenamiento de la red.
4. Consulte el resultado real en el monitor serie:

   | Mensaje exacto | Significado y acción |
   | --- | --- |
   | `New network connected and saved; setup closed.` | Se confirmó la conexión y el guardado completo; el portal se cierra. Continúe con el paso 7. |
   | `New network failed; existing networks preserved.` | Falló la asociación; las redes anteriores se conservan. Mientras el portal siga disponible, vuelva a abrirlo y corrija los datos. |
   | `Network connected; WiFi/location/name/interval save NOT fully confirmed. Review configuration.` | Hay conexión, pero el guardado completo no está confirmado. El portal puede cerrarse igualmente; revise la persistencia y solicite mantenimiento si es necesario. |

5. Cuando cierra el portal, desaparece el WiFi del ESP32 y el teléfono pierde esa
   conexión: **es normal, pero no demuestra que todo se haya guardado**. Vuelva a
   conectar el teléfono a su router o a su conexión habitual con Internet para
   consultar el panel. La página local deja de estar disponible.

El portal dura **10 minutos**. No acepta solicitudes en sus últimos **13 segundos**;
después de cerrarse espera al menos **cinco minutos** antes de que otro ciclo
fallido pueda abrirlo. También puede cerrarse si una red conocida conecta.
Si expira, las redes conocidas siguen reintentándose sin necesidad de reiniciar.

## 7. Comprobar la primera medición y los envíos siguientes

1. El sensor se consulta cada **10 segundos**, con la primera consulta preparada
   desde el inicio. Para enviar se necesita una lectura válida, WiFi listo y el
   portal cerrado. `Error sensor DHT11` indica que debe revisar el sensor.
2. En cuanto esas condiciones se cumplen, ambos destinos están pendientes de
   envío: **no existe una espera inicial de cinco minutos**. La siguiente consulta
   del DHT puede tardar hasta 10 segundos según el ciclo; una lectura inválida o
   una operación bloqueante puede demorar el envío. Conectar al router no garantiza
   Internet: el resultado de los POST, sin una prueba adicional previa, confirma
   la entrega.
3. Los destinos definidos en [WeatherDelivery.h](WeatherDelivery.h) son:
   - **Vercel:** `https://miniestaciones.vercel.app/api/esp32`.
   - **Servicio del VPS:** `https://estaciones.modernshop.com.ar/api/esp32`.
4. Busque en serie **`POST enviado (200): ...`**. El firmware considera exitoso
   cualquier código 2xx; el servidor local normalmente responde 200.
   **El registro no identifica el destino: un único 200 no demuestra la recepción
   en ambos servicios.** Un mensaje de MQTT o un latido tampoco la demuestra.
5. Abra cada panel previsto con el teléfono ya conectado a Internet. Compare la
   MAC HTTP, el nombre, las coordenadas y, especialmente, **la fecha/hora de una
   lectura nueva y sus valores**. Ver una estación antigua no basta. En el panel
   de esta aplicación, mientras la página está visible, la siguiente consulta se
   programa 60 segundos después de terminar la anterior; vuelva a mostrar la
   pestaña o recargue si es necesario. Ese refresco no es el intervalo del sensor
   ni el del envío. La hora de la lectura corresponde a la recepción en el servidor,
   no a una marca temporal generada por el sensor.

### Cómo continúan los envíos

Cada destino tiene su propio temporizador. Tras un éxito espera su intervalo
configurado, **300 segundos de forma predeterminada**, desde que terminó su envío.
Si falla, reintenta no antes de **60 segundos desde el inicio de su último intento**.
El éxito de un destino no confirma ni cancela el pendiente del otro.

Una transición observada de desconectado a listo vuelve a dejar pendientes ambos
destinos, pero respeta el límite de reintento de 60 segundos. Consultar repetidamente
el estado conectado no reinicia los temporizadores. Cambiar el intervalo efectivo
inicia una nueva espera para los destinos que ya habían enviado correctamente;
no elimina reintentos pendientes ni produce una ráfaga de envíos.

Los envíos son síncronos: un destino lento puede demorar el bucle y el otro destino.
Se envía la muestra reciente disponible, no una cola histórica de muestras tomadas
sin conexión. El intervalo meteorológico no cambia las cadencias del sensor,
los diagnósticos ni MQTT.

### Referencia del contenido enviado

Este ejemplo usa datos sintéticos y un marcador de credencial; **no es una orden
para ejecutar una petición de prueba**:

```http
POST /api/esp32
Content-Type: application/json
Authorization: Bearer <credencial-compartida-configurada>

{"mac":"02:00:00:00:00:01","name":"Estacion piloto","version":"ejemplo","temperature":22.5,"humidity":55.0,"lat":12.500000,"lon":-45.250000}
```

## 8. Reiniciar, conservar los ajustes y volver a configurar

1. Después de confirmar lecturas y guardado, realice un reinicio normal de la
   estación piloto. Compruebe que recupera la red y los metadatos esperados.
2. Si la red guardada sigue disponible, conecta sin pedir nuevamente los datos y
   puede no mostrar el portal. La primera muestra válida vuelve a estar pendiente
   de envío tras ese arranque, sin esperar el intervalo periódico inicial.
3. Para volver a configurar una placa ya conectada, tenga presente que **este
   firmware no ofrece un botón de configuración ni una ruta web de reinicio
   implementada**. El portal se abre por recuperación cuando no hay redes válidas
   o falla el ciclo de las conocidas, sujeto al plazo mínimo entre aperturas.
   Si necesita provocarlo en una prueba controlada, deje temporalmente fuera de
   alcance o no disponibles **todas** las redes que esa placa pueda utilizar y
   observe la consola. No interrumpa redes compartidas ni borre NVS para forzarlo.
4. Si no puede disponer de esa condición de forma segura, coordine mantenimiento.
   No existe aquí una apertura manual del portal desde el panel. Cuando vuelva a
   estar disponible, repita los pasos 5 y 6 y revise todos los campos opcionales.

## Resolver problemas sin borrar la configuración

| Situación o evidencia | Qué comprobar o hacer |
| --- | --- |
| No aparece `estacionm-nodo-xxxx` | La placa puede haber conectado a una red guardada. Consulte serie; también puede estar en espera entre aperturas o haber fallado la configuración protegida del punto de acceso. No suponga una red abierta. |
| Aparece `Setup unavailable: protected credential configuration/storage failed.` | La persona responsable debe revisar la selección de contraseña y NVS; no es un problema que se resuelva dejando la contraseña vacía en el teléfono. |
| La red aparece, pero el portal no abre | Mantenga el teléfono conectado pese al aviso sin Internet, descarte otro cliente conectado y escriba `http://192.168.4.1`. La apertura automática depende del navegador y del DNS; no use HTTPS. |
| El formulario rechaza los datos | Revise longitudes en bytes, contraseña WPA, pareja de coordenadas con punto decimal e intervalo entero entre 60 y 86400. Vuelva a abrir la página si la ventana o el token ya no son válidos. |
| Aparece «Configuración ocupada o espacios guardados completos. Las redes existentes se conservan.» | Puede haber una prueba pendiente o un problema de almacenamiento/capacidad. Espere o solicite mantenimiento; el formulario no borra redes para liberar espacio. |
| Aparece «La ventana de configuración está terminando. No se cambiaron credenciales. Reintente en la próxima ventana.» | Espere la próxima apertura permitida; no repita continuamente la solicitud. |
| El punto de acceso desaparece, pero no hay datos | Contraste el resultado de guardado en serie, la lectura del sensor, Internet y los resultados HTTP. La desaparición solo no confirma persistencia ni entrega. |
| Todavía no hay POST | Revise portal cerrado, WiFi listo, lectura DHT válida y espera de reintento por destino. No hay una espera inicial de cinco minutos. |
| `Error sensor DHT11` | Revise sensor y montaje con la alimentación desconectada. No espere envíos meteorológicos válidos mientras persista el error. |
| HTTP 401 | La credencial compartida configurada debe coincidir con `ESP32_AUTH_TOKEN` de ese receptor. La contraseña aleatoria del punto de acceso no se envía. |
| HTTP 503 | Falta la configuración de autorización de ingesta en el receptor o es inválida; corresponde revisarla al operador. |
| HTTP 400 | El receptor rechazó los datos: compruebe MAC, mediciones numéricas y coordenadas completas. No confunda este error remoto con un 400 del portal local. |
| HTTP 500 | El operador debe revisar errores del servidor o de persistencia. Configurar una estación no requiere reiniciar ni migrar la base de datos. |
| Código de transporte negativo o sin respuesta | Revise Internet del router, DNS, disponibilidad del destino y transporte HTTPS; no equivale a un rechazo HTTP del servidor. |
| Los nuevos valores del firmware no aparecen | Una sustitución guardada puede tener prioridad. Elimínela mediante un formulario guardado correctamente con los campos correspondientes vacíos. |
| Necesita eliminar deliberadamente todos los ajustes locales anteriores | Consulte [inicio limpio / borrar configuración](#opcional-inicio-limpio--borrar-configuración-con-arduino-ide), con copia privada de los datos necesarios y borrado completo de flash; no es el procedimiento para una actualización normal. |
| La placa o el sensor se calientan demasiado | Desconecte la alimentación y revise el hardware. La causa no está establecida por esta guía. |

Los significados HTTP se contrastaron con el código local del servidor; no son
el resultado de una prueba contra los servicios publicados. No comparta registros
sin revisar: pueden contener contraseñas privadas o cabeceras de autorización.

## Lista de aceptación de la estación piloto y siguientes pasos

- [ ] Se utilizó la carpeta correcta, con placa, bibliotecas y particiones
  identificadas; se comprobó compilación y tamaño.
- [ ] El montaje funciona sin calentamiento anormal y entrega lecturas DHT válidas.
- [ ] La identidad es única y el nombre, ubicación e intervalo son los deseados.
- [ ] El puerto serie confirma el guardado completo y un reinicio conserva los ajustes.
- [ ] Aparece una lectura nueva en cada destino previsto, con la MAC esperada.
- [ ] Se comprobó también el envío posterior al intervalo configurado.

**Siguiente paso:** una vez aceptada la estación piloto, repita la preparación y
la comprobación por placa. No clone una MAC alternativa entre estaciones. La
validación física, de compilación y de recepción real debe hacerse durante ese
piloto; la revisión de documentación y las pruebas locales no la sustituyen.

## Referencia para mantenimiento

### Almacenamiento y límites

Las redes WiFi se agregan a espacios NVS en `station-wifi`, hasta cinco redes
guardadas, seguidas de hasta cinco alternativas compiladas. Cambiar la contraseña
consume otro espacio; desde el portal no se borran ni reemplazan redes anteriores.
El almacenamiento lleno o corrupto requiere un procedimiento de mantenimiento
separado y autorizado.

Nombre, ubicación e intervalo (`sendSeconds`) son valores separados en
`station-meta`. Se guardan solo después de una asociación nueva y del guardado
confirmado de la red. Las escrituras entre claves y la reversión de cambios no
son atómicas ante fallos de almacenamiento o cortes de alimentación: compruebe
los guardados inciertos en lugar de asumir que todo se aplicó o se deshizo.

### Diagnósticos, MQTT y OTA

Los diagnósticos son opcionales y están separados de las mediciones meteorológicas.
Necesitan su propio token, CA de confianza, aprobación explícita de TLS y reloj
listo; consulte [DiagnosticsLocal.example.h](DiagnosticsLocal.example.h). No es
necesario configurarlos para habilitar los envíos meteorológicos normales.
El nombre de diagnóstico tiene un contrato ASCII separado. El nombre configurado
en el portal no cambia los nombres MQTT/OTA ni la identidad de radio.

### Edición del portal y comprobaciones locales

Para modificar el portal, edite [portal/setup.html](portal/setup.html),
[portal/setup.css](portal/setup.css) y [portal/setup.js](portal/setup.js), no
directamente el archivo generado `PortalAssets.h`. Las comprobaciones locales
existentes están en [tests/](tests/); no reemplazan la compilación para la placa,
las pruebas de aislamiento del punto de acceso ni la validación física.

Los cambios de esta copia local solo llegan a futuras descargas después del
proceso posterior de confirmación, publicación y compilación correspondiente.
**Editar esta guía no ejecuta ninguno de esos pasos**, no despliega servicios,
no modifica bases de datos y no actualiza las placas instaladas.
