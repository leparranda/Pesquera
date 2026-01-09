// =================== CONFIGURACIÓN INICIAL ===================
        console.log('🚀 Iniciando PESQUERA RINCON DEL MAR...');

        // Verificar si se debe resetear el sistema
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('reset') === 'true') {
            console.log('🔄 Reseteando localStorage...');
            localStorage.removeItem('sesionPesquera');
            localStorage.removeItem('ultimoLogin');
            console.log('✅ LocalStorage limpiado');
            // Remover el parámetro de la URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Configuración de la API
        const API_KEY = 'AIzaSyBHyIgNRB_Td-Zq9p2FwxSDruIsz0EOvlk';
        const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
        const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx2T-85v0ARb3WpIcj7jtC8jdayAct3fKyvEYGCstuqjZN2Cv9ZUJ4Kn2lQtzn52rF1/exec';

        // Variables globales
        let spreadsheetId = localStorage.getItem('spreadsheetId') || '';
        let isConfigured = false;
        let ventaActual = [];
        let inventarioData = {};
        let preciosData = {};
        
        // Variables para reportes
        let ventasCompletasData = []; // Almacenará todas las ventas sin filtrar

        // Configuración de empresa
        let config = {
            nombreEmpresa: localStorage.getItem('nombreEmpresa') || 'Pesquera Rincon del Mar',
            direccionEmpresa: localStorage.getItem('direccionEmpresa') || 'Dirección de la empresa',
            telefonoEmpresa: localStorage.getItem('telefonoEmpresa') || '(000) 000-0000'
        };

        // =================== CONSTANTES DE CONVERSIÓN ===================
        const LIBRAS_A_KILOS = 0.5; // 1 libra = 0.453592 kilogramos
        const KILOS_A_LIBRAS = 2; // 1 kilogramo = 2.20462 libras

        // Función para convertir gramos a kilogramos
        function gramosAKilogramos(gramos) {
            return gramos / 1000;
        }

        // Función para mostrar conversión en tiempo real
        window.mostrarConversionKilos = function() {
            const gramos = parseFloat(document.getElementById('cantidadVenta').value) || 0;
            const kilos = gramosAKilogramos(gramos);
            const elemento = document.getElementById('conversionKilos');
            
            if (gramos > 0) {
                elemento.style.display = 'block';
                elemento.textContent = `= ${kilos.toFixed(3)} kg`;
            } else {
                elemento.style.display = 'none';
                elemento.textContent = '';
            }
        };

        // Función para parsear productos (compatible con lbs y kg)
        function parsearProducto(productoStr) {
            // Intentar primero con kilogramos (formato nuevo)
            let match = productoStr.match(/^(.+?)\s*\(([0-9.]+)\s*kg\)$/);
            if (match) {
                return {
                    tipo: match[1].trim(),
                    cantidad: parseFloat(match[2]),
                    unidad: 'kg'
                };
            }
            
            // Si no, intentar con libras (formato histórico)
            match = productoStr.match(/^(.+?)\s*\(([0-9.]+)\s*lbs?\)$/);
            if (match) {
                const cantidadLibras = parseFloat(match[2]);
                return {
                    tipo: match[1].trim(),
                    cantidad: cantidadLibras, // MANTENER en libras, no convertir
                    unidad: 'lbs' // Importante: marcar que está en libras
                };
            }
            
            return null;
        }

        // Función para detectar si un registro es en libras (datos históricos) o kilos (datos nuevos)
        // Los datos históricos tendrán cantidades típicas de libras (1-100), los nuevos en kilos (0.5-50)
        function esRegistroEnLibras(cantidad) {
            // Si la cantidad es mayor a 100, asumimos que son datos antiguos en libras
            // o si es un número entero pequeño común en libras (1, 2, 3, etc.)
            return false; // Por defecto asumimos que todos los nuevos datos son en kilos
        }

        // Función para convertir precio por libra a precio por kilo
        function precioLibraAKilo(precioLibra) {
            return precioLibra * KILOS_A_LIBRAS;
        }

        // Función para convertir precio por kilo a precio por libra
        function precioKiloALibra(precioKilo) {
            return precioKilo / KILOS_A_LIBRAS;
        }

        console.log('✅ Variables inicializadas correctamente');

        // =================== FUNCIONES DE FORMATO PARA PESOS COLOMBIANOS ===================

        // Función para formatear números como pesos colombianos
        function formatearPesos(numero) {
            if (isNaN(numero) || numero === null || numero === undefined) {
                return '$0';
            }

            // Redondear a número entero para pesos colombianos
            const numeroRedondeado = Math.round(numero);

            // Formatear con separadores de miles (puntos)
            return '$' + numeroRedondeado.toLocaleString('es-CO');
        }

        // Función para formatear números sin símbolo de moneda
        function formatearNumero(numero) {
            if (isNaN(numero) || numero === null || numero === undefined) {
                return '0';
            }

            const numeroRedondeado = Math.round(numero);
            return numeroRedondeado.toLocaleString('es-CO');
        }


        function llamarAPIConJSONP(data = null) {
          return new Promise((resolve, reject) => {
            // Calcular tamaño de los datos
            const dataJson = data ? JSON.stringify(data) : '';
            const dataSize = dataJson.length;
            
            // Si los datos son muy grandes, informar al usuario
            if (dataSize > 2000) {
              console.warn(`⚠️ Datos grandes detectados: ${dataSize} caracteres`);
              console.warn(`Esto puede causar errores. Límite recomendado: 2000`);
            }
            
            console.log(`📡 Enviando petición JSONP (${dataSize} chars)`);
            
            const callbackName = 'jsonp_callback_' + Math.random().toString(36).substr(2, 9);
            const script = document.createElement('script');

            // Crear función callback global
            window[callbackName] = function(response) {
              // Limpiar
              delete window[callbackName];
              if (document.body.contains(script)) {
                document.body.removeChild(script);
              }

              // Resolver o rechazar según la respuesta
              if (response.error) {
                reject(new Error(response.error));
              } else {
                resolve(response);
              }
            };

            // Configurar parámetros
            const params = new URLSearchParams({
              callback: callbackName
            });

            if (data) {
              params.append('data', dataJson);
            }

            // Configurar script
            const fullUrl = `${APPS_SCRIPT_URL}?${params}`;
            script.src = fullUrl;
            
            // Mostrar URL truncada en caso de error
            script.onerror = (error) => {
              delete window[callbackName];
              if (document.body.contains(script)) {
                document.body.removeChild(script);
              }
              console.error('❌ Error JSONP completo:', {
                urlLength: fullUrl.length,
                urlPreview: fullUrl.substring(0, 200) + '...',
                dataSize: dataSize,
                error: error
              });
              
              // Mensaje específico si la URL es muy larga
              let errorMsg = 'Error en la solicitud JSONP';
              if (fullUrl.length > 8000) {
                errorMsg += '. La URL es demasiado larga (' + fullUrl.length + ' chars). Contacte al desarrollador.';
              }
              
              reject(new Error(errorMsg));
            };

            // Timeout de 45 segundos
            setTimeout(() => {
              if (window[callbackName]) {
                delete window[callbackName];
                if (document.body.contains(script)) {
                  document.body.removeChild(script);
                }
                console.error('⏱️ Timeout JSONP:', {
                  urlLength: fullUrl.length,
                  dataSize: dataSize
                });
                reject(new Error('Timeout en la solicitud JSONP (45s). La operación tomó demasiado tiempo.'));
              }
            }, 45000);

            document.body.appendChild(script);
          });
        }

        // =================== FUNCIONES DE UTILIDAD ===================

        // Función para mostrar alertas
        function mostrarAlerta(mensaje, tipo = 'info') {
            // Eliminar alertas existentes
            const alertasExistentes = document.querySelectorAll('.alert');
            alertasExistentes.forEach(alerta => alerta.remove());

            // Crear nueva alerta
            const alerta = document.createElement('div');
            alerta.className = `alert alert-${tipo}`;
            alerta.textContent = mensaje;

            // Insertar al principio del contenido actual
            const seccionActiva = document.querySelector('.section.active');
            if (seccionActiva) {
                seccionActiva.insertBefore(alerta, seccionActiva.firstChild);
            }

            // Auto-eliminar después de 5 segundos
            setTimeout(() => {
                if (alerta.parentNode) {
                    alerta.remove();
                }
            }, 5000);
        }

        // Función para actualizar el estado de conexión
        function updateConnectionStatus(estado, mensaje) {
            const statusElements = [
                'connectionStatus',
                'inventarioStatus', 
                'preciosStatus',
                'ventasStatus',
                'reportesStatus'
            ];

            statusElements.forEach(elementId => {
                const element = document.getElementById(elementId);
                if (element) {
                    element.className = `connection-status status-${estado}`;

                    let icono = '🔧';
                    if (estado === 'connected') icono = '✅';
                    else if (estado === 'loading') icono = '⏳';
                    else if (estado === 'disconnected') icono = '❌';

                    element.innerHTML = `<span>${icono}</span><span>${mensaje}</span>`;
                }
            });
        }

        // Función para cambiar secciones
        window.showSection = function(seccionId) {
            // Ocultar todas las secciones
            const secciones = document.querySelectorAll('.section');
            secciones.forEach(seccion => seccion.classList.remove('active'));

            // Desactivar todas las pestañas
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach(tab => tab.classList.remove('active'));

            // Activar la sección seleccionada
            const seccionSeleccionada = document.getElementById(seccionId);
            if (seccionSeleccionada) {
                seccionSeleccionada.classList.add('active');
            }

            // Activar la pestaña correspondiente
            const tabSeleccionada = event.target;
            if (tabSeleccionada) {
                tabSeleccionada.classList.add('active');
            }

            // Cargar datos específicos de la sección
            if (seccionId === 'precios' && isConfigured) {
                cargarInventarioParaPrecios();
            }
            if (seccionId === 'ventas' && isConfigured) {
                cargarInventarioParaVentas();
            }
        };

        // =================== FUNCIONES DE API ===================

        // Funciones de la API de Google Sheets
        async function leerHoja(nombreHoja) {
            if (!spreadsheetId) {
                throw new Error('Configure el ID del Google Sheet primero');
            }

            const range = `${nombreHoja}!A:Z`;
            const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${range}?key=${API_KEY}`;

            const response = await fetch(url);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error al leer ${nombreHoja}: ${errorData.error.message}`);
            }

            const data = await response.json();
            return data.values || [];
        }

        async function escribirHoja(nombreHoja, datos) {
          if (!spreadsheetId) {
            throw new Error('Configure el ID del Google Sheet primero');
          }

          const requestData = {
            action: 'escribirHoja',
            spreadsheetId: spreadsheetId,
            nombreHoja: nombreHoja,
            datos: datos
          };

          return await llamarAPIConJSONP(requestData);
        }

        async function agregarFilaHoja(nombreHoja, fila) {
          if (!spreadsheetId) {
            throw new Error('Configure el ID del Google Sheet primero');
          }

          const requestData = {
            action: 'agregarFila',
            spreadsheetId: spreadsheetId,
            nombreHoja: nombreHoja,
            fila: fila
          };

          return await llamarAPIConJSONP(requestData);
        }


        // Función auxiliar para escribir con reintentos
        async function escribirHojaConReintento(nombreHoja, datos, intentos = 3) {
          for (let i = 0; i < intentos; i++) {
            try {
              console.log(`📝 Intento ${i + 1}/${intentos} de escribir en ${nombreHoja}...`);
              await escribirHoja(nombreHoja, datos);
              console.log(`✅ Escritura exitosa en ${nombreHoja}`);
              return;
            } catch (error) {
              console.error(`❌ Error en intento ${i + 1}:`, error.message);
              if (i === intentos - 1) {
                throw error; // Lanzar el error en el último intento
              }
              // Esperar antes de reintentar (2, 4, 6 segundos)
              const tiempoEspera = (i + 1) * 2000;
              console.log(`⏳ Esperando ${tiempoEspera/1000}s antes de reintentar...`);
              await new Promise(resolve => setTimeout(resolve, tiempoEspera));
            }
          }
        }

        // Función auxiliar para agregar fila con reintentos
        async function agregarFilaConReintento(nombreHoja, fila, intentos = 3) {
          for (let i = 0; i < intentos; i++) {
            try {
              console.log(`📝 Intento ${i + 1}/${intentos} de agregar fila en ${nombreHoja}...`);
              await agregarFilaHoja(nombreHoja, fila);
              console.log(`✅ Fila agregada exitosamente en ${nombreHoja}`);
              return;
            } catch (error) {
              console.error(`❌ Error en intento ${i + 1}:`, error.message);
              if (i === intentos - 1) {
                // En el último intento, no lanzar error para agregar (es opcional)
                console.warn(`⚠️ No se pudo agregar fila después de ${intentos} intentos`);
                return;
              }
              // Esperar antes de reintentar
              const tiempoEspera = (i + 1) * 2000;
              console.log(`⏳ Esperando ${tiempoEspera/1000}s antes de reintentar...`);
              await new Promise(resolve => setTimeout(resolve, tiempoEspera));
            }
          }
        }


        // =================== FUNCIONES PRINCIPALES ===================

        // REEMPLAZA tu función window.pruebaBasica con esta versión simplificada
        window.pruebaBasica = async function() {
          console.log('🧪 Iniciando prueba básica del sistema...');
          mostrarAlerta('🧪 Probando solo Google Apps Script con JSONP...', 'warning');

          try {
            console.log('🚀 Probando Apps Script con JSONP...');
            console.log('📍 URL que se va a probar:', APPS_SCRIPT_URL);

            // Solo probar JSONP - sin Google Sheets API por ahora
            const appsScriptResponse = await llamarAPIConJSONP();
            console.log('✅ Apps Script respuesta:', appsScriptResponse);

            if (appsScriptResponse.success || appsScriptResponse.message) {
              mostrarAlerta('✅ Apps Script con JSONP: FUNCIONA PERFECTAMENTE', 'success');
              console.log('🎉 El sistema está listo para usar');
            } else {
              mostrarAlerta('⚠️ Apps Script responde pero con formato inesperado', 'warning');
              console.log('🔍 Respuesta recibida:', appsScriptResponse);
            }
          } catch (appsScriptError) {
            console.error('❌ Error en Apps Script:', appsScriptError);
            console.error('🔍 Detalles del error:', {
              message: appsScriptError.message,
              url: APPS_SCRIPT_URL,
              timestamp: new Date().toISOString()
            });
            mostrarAlerta(`❌ Error en Apps Script: ${appsScriptError.message}`, 'danger');

            // Mostrar ayuda específica
            if (appsScriptError.message.includes('Error al cargar script JSONP')) {
              mostrarAlerta('💡 SOLUCIÓN: Verifica que hayas hecho un nuevo deployment del Apps Script y copiado la URL correcta', 'warning');
            }
          }
        };

        // TAMBIÉN agrega esta función para probar la URL directamente
        window.probarURLDirecta = function() {
          const url = APPS_SCRIPT_URL;
          console.log('🌐 Abriendo URL en nueva pestaña:', url);
          mostrarAlerta('📝 Abriendo Apps Script en nueva pestaña. Deberías ver un JSON con el mensaje de funcionamiento.', 'info');
          window.open(url, '_blank');
        };

        // Probar conexión con Google Sheets
        window.probarConexion = async function() {
            console.log('🔌 Iniciando prueba de conexión...');

            const idSheet = document.getElementById('spreadsheetId').value.trim();

            if (!idSheet) {
                mostrarAlerta('⚠️ Ingrese el ID del Google Sheet', 'warning');
                return;
            }

            updateConnectionStatus('loading', 'Probando conexión...');

            try {
                const url = `${SHEETS_API_BASE}/${idSheet}?key=${API_KEY}`;
                const response = await fetch(url);

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error.message);
                }

                const data = await response.json();
                updateConnectionStatus('connected', `Conectado a: ${data.properties.title}`);
                mostrarAlerta('✅ Conexión exitosa con Google Sheets', 'success');

                // Verificar hojas necesarias
                const hojasExistentes = data.sheets.map(sheet => sheet.properties.title);
                const hojasRequeridas = ['Inventario', 'Precios', 'Ventas', 'Configuracion'];
                const hojasFaltantes = hojasRequeridas.filter(hoja => !hojasExistentes.includes(hoja));

                if (hojasFaltantes.length > 0) {
                    mostrarAlerta(`⚠️ Faltan las siguientes hojas: ${hojasFaltantes.join(', ')}. Use el botón "Crear Estructura".`, 'warning');
                } else {
                    mostrarAlerta('🎉 Todas las hojas necesarias están disponibles', 'success');

                    // *** AQUÍ ESTÁ LA CORRECCIÓN PRINCIPAL ***
                    // Actualizar el spreadsheetId temporalmente para poder cargar datos
                    const spreadsheetIdAnterior = spreadsheetId;
                    spreadsheetId = idSheet;

                    try {
                        // Cargar datos existentes de las hojas
                        console.log('📊 Cargando datos existentes...');
                        await cargarTodosLosDatos();
                        mostrarAlerta('📊 Datos cargados correctamente desde Google Sheets', 'success');
                    } catch (errorCarga) {
                        console.error('Error al cargar datos:', errorCarga);
                        mostrarAlerta(`⚠️ Conexión exitosa pero error al cargar datos: ${errorCarga.message}`, 'warning');
                        spreadsheetId = spreadsheetIdAnterior; // Restaurar ID anterior si falla
                    }
                }

            } catch (error) {
                updateConnectionStatus('disconnected', `Error: ${error.message}`);
                mostrarAlerta(`❌ Error de conexión: ${error.message}`, 'danger');
            }
        };

        // Crear estructura de hojas
        window.crearEstructuraHojas = async function() {
            if (!spreadsheetId) {
                mostrarAlerta('⚠️ Configure el ID del Google Sheet primero', 'warning');
                return;
            }

            try {
                updateConnectionStatus('loading', 'Creando estructura...');

                const estructuras = {
                    'Inventario': [
                        ['Tipo', 'Stock', 'PrecioPromedio', 'ValorTotal', 'UltimaActualizacion']
                    ],
                    'Precios': [
                        ['Tipo', 'PrecioCompra', 'Margen', 'PrecioVenta', 'Ganancia']
                    ],
                    'Ventas': [
                        ['NumeroFactura', 'Fecha', 'Cliente', 'Productos', 'Total']
                    ],
                    'Configuracion': [
                        ['UltimoNumeroFactura', 'NombreEmpresa', 'DireccionEmpresa', 'TelefonoEmpresa'],
                        [1, config.nombreEmpresa, config.direccionEmpresa, config.telefonoEmpresa]
                    ]
                };

                let hojasCreadas = 0;
                for (const [nombreHoja, datos] of Object.entries(estructuras)) {
                    try {
                        await escribirHoja(nombreHoja, datos);
                        hojasCreadas++;
                    } catch (error) {
                        mostrarAlerta(`Error al crear hoja ${nombreHoja}: ${error.message}`, 'danger');
                    }
                }

                if (hojasCreadas === Object.keys(estructuras).length) {
                    updateConnectionStatus('connected', 'Estructura creada correctamente');
                    mostrarAlerta('🎉 Estructura de hojas creada exitosamente', 'success');
                }

            } catch (error) {
                updateConnectionStatus('disconnected', `Error: ${error.message}`);
                mostrarAlerta(`❌ Error al crear estructura: ${error.message}`, 'danger');
            }
        };

        // Guardar configuración
        window.guardarConfiguracion = async function() {
            const newSpreadsheetId = document.getElementById('spreadsheetId').value.trim();

            if (!newSpreadsheetId) {
                mostrarAlerta('⚠️ Ingrese el ID del Google Sheet', 'warning');
                return;
            }

            spreadsheetId = newSpreadsheetId;
            localStorage.setItem('spreadsheetId', spreadsheetId);
            isConfigured = true;

            mostrarAlerta('💾 Configuración guardada correctamente', 'success');

            // Cargar datos después de guardar configuración
            try {
                await cargarTodosLosDatos();
                mostrarAlerta('📊 Datos cargados correctamente', 'success');
            } catch (error) {
                console.error('Error al cargar datos después de guardar configuración:', error);
                mostrarAlerta(`⚠️ Configuración guardada pero error al cargar datos: ${error.message}`, 'warning');
            }
        };

        // Guardar datos de empresa
        window.guardarDatosEmpresa = function() {
            config.nombreEmpresa = document.getElementById('nombreEmpresa').value;
            config.direccionEmpresa = document.getElementById('direccionEmpresa').value;
            config.telefonoEmpresa = document.getElementById('telefonoEmpresa').value;

            localStorage.setItem('nombreEmpresa', config.nombreEmpresa);
            localStorage.setItem('direccionEmpresa', config.direccionEmpresa);
            localStorage.setItem('telefonoEmpresa', config.telefonoEmpresa);

            mostrarAlerta('💾 Datos de empresa guardados', 'success');
        };

        // =================== FUNCIONES DE DATOS ===================

        // Cargar todos los datos
        async function cargarTodosLosDatos() {
            if (!spreadsheetId) {
                throw new Error('Configure el ID del Google Sheet primero');
            }

            try {
                updateConnectionStatus('loading', 'Cargando datos...');

                console.log('📊 Cargando inventario...');
                await cargarInventario();

                console.log('💰 Cargando precios...');
                await cargarPrecios();

                updateConnectionStatus('connected', 'Datos cargados correctamente');
                isConfigured = true;

                console.log('✅ Todos los datos cargados exitosamente');

            } catch (error) {
                console.error('❌ Error al cargar datos:', error);
                updateConnectionStatus('disconnected', `Error: ${error.message}`);
                throw error; // Re-lanzar el error para que lo maneje quien llama
            }
        }

        // Cargar inventario
        async function cargarInventario() {
            try {
                const datos = await leerHoja('Inventario');

                inventarioData = {};
                if (datos.length > 1) {
                    for (let i = 1; i < datos.length; i++) {
                        const fila = datos[i];
                        if (fila[0]) {
                            inventarioData[fila[0]] = {
                                stock: parseFloat(fila[1]) || 0,
                                precioPromedio: parseFloat(fila[2]) || 0,
                                valorTotal: parseFloat(fila[3]) || 0,
                                ultimaActualizacion: fila[4] || ''
                            };
                        }
                    }
                }

                actualizarTablaInventario();
            } catch (error) {
                console.error('Error al cargar inventario:', error);
                throw error;
            }
        }

        // Cargar precios
        async function cargarPrecios() {
            try {
                const datos = await leerHoja('Precios');

                preciosData = {};
                if (datos.length > 1) {
                    for (let i = 1; i < datos.length; i++) {
                        const fila = datos[i];
                        if (fila[0]) {
                            preciosData[fila[0]] = {
                                precioCompra: parseFloat(fila[1]) || 0,
                                margen: parseFloat(fila[2]) || 0,
                                precioVenta: parseFloat(fila[3]) || 0,
                                ganancia: parseFloat(fila[4]) || 0
                            };
                        }
                    }
                }

                actualizarTablaPrecios();
            } catch (error) {
                console.error('Error al cargar precios:', error);
                throw error;
            }
        }
        // Función para verificar si hay datos en las hojas
        async function verificarDatosExistentes() {
            try {
                const inventarioData = await leerHoja('Inventario');
                const preciosData = await leerHoja('Precios');
                const ventasData = await leerHoja('Ventas');

                const tieneInventario = inventarioData.length > 1;
                const tienePrecios = preciosData.length > 1;
                const tieneVentas = ventasData.length > 1;

                console.log('📊 Estado de los datos:', {
                    inventario: tieneInventario ? `${inventarioData.length - 1} items` : 'vacío',
                    precios: tienePrecios ? `${preciosData.length - 1} items` : 'vacío',
                    ventas: tieneVentas ? `${ventasData.length - 1} items` : 'vacío'
                });

                return { tieneInventario, tienePrecios, tieneVentas };
            } catch (error) {
                console.error('Error al verificar datos existentes:', error);
                return { tieneInventario: false, tienePrecios: false, tieneVentas: false };
            }
        }

        // =================== FUNCIONES DE INVENTARIO ===================

        // Agregar inventario
        window.agregarInventario = async function() {
            if (!isConfigured) {
                mostrarAlerta('Configure el sistema primero', 'warning');
                return;
            }

            const tipo = document.getElementById('tipoPescadoInventario').value;
            const libras = parseFloat(document.getElementById('librasRecibidas').value);
            const precio = parseFloat(document.getElementById('precioCompra').value);
            const proveedor = document.getElementById('proveedorInventario').value.trim();

            if (!tipo || !libras || !precio) {
                mostrarAlerta('Complete todos los campos obligatorios', 'warning');
                return;
            }

            const btnAgregar = document.getElementById('btnAgregarInventario');
            btnAgregar.disabled = true;
            btnAgregar.innerHTML = '<span class="loading"></span> AGREGANDO...';

            try {
                // Calcular nuevo inventario
                if (!inventarioData[tipo]) {
                    inventarioData[tipo] = { stock: 0, precioPromedio: 0, valorTotal: 0 };
                }

                const valorAnterior = inventarioData[tipo].valorTotal;

                inventarioData[tipo].stock += libras;
                inventarioData[tipo].valorTotal = valorAnterior + (libras * precio);
                inventarioData[tipo].precioPromedio = inventarioData[tipo].valorTotal / inventarioData[tipo].stock;
                inventarioData[tipo].ultimaActualizacion = new Date().toLocaleDateString();

                // Preparar datos para escribir en Inventario
                const datosInventario = [
                    ['Tipo', 'Stock', 'PrecioPromedio', 'ValorTotal', 'UltimaActualizacion'],
                    ...Object.entries(inventarioData).map(([tipoPez, datos]) => [
                        tipoPez,
                        datos.stock,
                        datos.precioPromedio,
                        datos.valorTotal,
                        datos.ultimaActualizacion
                    ])
                ];

                await escribirHoja('Inventario', datosInventario);

                // =================== REGISTRAR EN HISTÓRICO ===================
                const fechaActual = new Date().toLocaleDateString();
                const valorTotal = libras * precio;
                const proveedorFinal = proveedor || 'No especificado';

                // Leer histórico actual
                let datosHistorico = [];
                try {
                    datosHistorico = await leerHoja('Historico');
                    if (datosHistorico.length === 0) {
                        // Si está vacío, crear con encabezados
                        datosHistorico = [['Tipo', 'Cantidad', 'PrecioCompra', 'Proveedor', 'Fecha', 'ValorTotal']];
                    }
                } catch (error) {
                    console.log('Creando nueva hoja de histórico');
                    datosHistorico = [['Tipo', 'Cantidad', 'PrecioCompra', 'Proveedor', 'Fecha', 'ValorTotal']];
                }

                // Agregar nueva entrada al histórico
                datosHistorico.push([tipo, libras, precio, proveedorFinal, fechaActual, valorTotal]);

                // Escribir histórico actualizado
                await escribirHoja('Historico', datosHistorico);
                console.log('✅ Entrada registrada en histórico');
                // =================== FIN REGISTRO HISTÓRICO ===================

                // Limpiar formulario
                document.getElementById('tipoPescadoInventario').value = '';
                document.getElementById('librasRecibidas').value = '';
                document.getElementById('precioCompra').value = '';
                document.getElementById('proveedorInventario').value = '';

                actualizarTablaInventario();
                mostrarAlerta('✅ Inventario actualizado y registrado en histórico', 'success');

            } catch (error) {
                mostrarAlerta(`Error al actualizar inventario: ${error.message}`, 'danger');
            } finally {
                btnAgregar.disabled = false;
                btnAgregar.innerHTML = 'AGREGAR AL INVENTARIO';
            }
        };

        // Actualizar tabla de inventario
        function actualizarTablaInventario() {
            const tbody = document.querySelector('#tablaInventario tbody');
            tbody.innerHTML = '';

            for (const [tipo, datos] of Object.entries(inventarioData)) {
                const fila = tbody.insertRow();

                let estado = '✅ Disponible';
                let claseEstado = '';

                if (datos.stock === 0) {
                    estado = '🔴 Agotado';
                    claseEstado = 'style="background-color: #f8d7da;"';
                } else if (datos.stock < 5) {
                    estado = '🟠 Crítico';
                    claseEstado = 'style="background-color: #fff3cd;"';
                } else if (datos.stock < 10) {
                    estado = '🟡 Bajo';
                    claseEstado = 'style="background-color: #fff3cd;"';
                }

                fila.innerHTML = `
                    <td>${tipo}</td>
                    <td>${parseFloat(datos.stock.toFixed(3))}</td>
                    <td>${formatearPesos(datos.precioPromedio)}</td>
                    <td>${formatearPesos(datos.valorTotal)}</td>
                    <td>${datos.ultimaActualizacion || 'N/A'}</td>
                    <td ${claseEstado}>${estado}</td>
                `;
            }
        }

        // =================== FUNCIONES DE PRECIOS ===================

        // Cargar inventario para precios
        function cargarInventarioParaPrecios() {
            const select = document.getElementById('tipoPescadoPrecio');
            select.innerHTML = '<option value="">Seleccionar...</option>';

            for (const tipo in inventarioData) {
                select.innerHTML += `<option value="${tipo}">${tipo}</option>`;
            }
        }

        // Cargar precio de compra actual cuando se selecciona un pescado
        function cargarPrecioCompraActual() {
            const tipo = document.getElementById('tipoPescadoPrecio').value;
            const precioCompraInput = document.getElementById('precioCompraActual');
            
            if (tipo && preciosData[tipo]) {
                // Usar el precio de compra de la tabla de Precios
                precioCompraInput.value = Math.round(preciosData[tipo].precioCompra);
                // Cargar también el margen y precio de venta si existen
                document.getElementById('margenGanancia').value = preciosData[tipo].margen.toFixed(2);
                document.getElementById('precioVentaManual').value = Math.round(preciosData[tipo].precioVenta);
            } else if (tipo && inventarioData[tipo]) {
                // Si no hay precio configurado, usar el precio promedio del inventario como referencia
                precioCompraInput.value = Math.round(inventarioData[tipo].precioPromedio);
                // Limpiar otros campos
                document.getElementById('margenGanancia').value = '';
                document.getElementById('precioVentaManual').value = '';
            } else {
                // Limpiar todos los campos
                precioCompraInput.value = '';
                document.getElementById('margenGanancia').value = '';
                document.getElementById('precioVentaManual').value = '';
            }
        }

        // Calcular precio de venta desde el margen
        function calcularPrecioVentaDesdeMargen() {
            const precioCompra = parseFloat(document.getElementById('precioCompraActual').value);
            const margen = parseFloat(document.getElementById('margenGanancia').value);
            
            if (precioCompra && margen) {
                const precioVenta = precioCompra * (1 + margen / 100);
                // Redondear a número entero para pesos colombianos
                document.getElementById('precioVentaManual').value = Math.round(precioVenta);
            }
        }

        // Calcular margen desde el precio de venta
        function calcularMargenDesdeVenta() {
            const precioCompra = parseFloat(document.getElementById('precioCompraActual').value);
            const precioVenta = parseFloat(document.getElementById('precioVentaManual').value);
            
            if (precioCompra && precioVenta && precioCompra > 0) {
                const margen = ((precioVenta - precioCompra) / precioCompra) * 100;
                document.getElementById('margenGanancia').value = margen.toFixed(2);
            }
        }

        // Configurar precio
        window.configurarPrecio = async function() {
            if (!isConfigured) {
                mostrarAlerta('Configure el sistema primero', 'warning');
                return;
            }

            const tipo = document.getElementById('tipoPescadoPrecio').value;
            const precioCompraInput = parseFloat(document.getElementById('precioCompraActual').value);
            const precioVentaInput = parseFloat(document.getElementById('precioVentaManual').value);

            if (!tipo) {
                mostrarAlerta('Seleccione un tipo de pescado', 'warning');
                return;
            }

            if (!precioCompraInput || precioCompraInput <= 0) {
                mostrarAlerta('Ingrese un precio de compra válido', 'warning');
                return;
            }

            if (!precioVentaInput || precioVentaInput <= 0) {
                mostrarAlerta('Ingrese un precio de venta válido', 'warning');
                return;
            }

            const btnConfigurar = document.getElementById('btnConfigurarPrecio');
            btnConfigurar.disabled = true;
            btnConfigurar.innerHTML = '<span class="loading"></span> GUARDANDO...';

            try {
                // Usar los precios ingresados por el usuario
                const precioCompra = precioCompraInput;
                const precioVenta = precioVentaInput;
                const margenCalculado = ((precioVenta - precioCompra) / precioCompra) * 100;
                const ganancia = precioVenta - precioCompra;

                preciosData[tipo] = {
                    precioCompra: precioCompra,
                    margen: margenCalculado,
                    precioVenta: precioVenta,
                    ganancia: ganancia
                };

                // Preparar datos para escribir
                const datosPrecios = [
                    ['Tipo', 'PrecioCompra', 'Margen', 'PrecioVenta', 'Ganancia'],
                    ...Object.entries(preciosData).map(([tipoPez, datos]) => [
                        tipoPez,
                        datos.precioCompra,
                        datos.margen,
                        datos.precioVenta,
                        datos.ganancia
                    ])
                ];

                await escribirHoja('Precios', datosPrecios);

                // Limpiar formulario
                document.getElementById('tipoPescadoPrecio').value = '';
                document.getElementById('precioCompraActual').value = '';
                document.getElementById('margenGanancia').value = '';
                document.getElementById('precioVentaManual').value = '';

                actualizarTablaPrecios();
                mostrarAlerta('Precio configurado correctamente', 'success');
                document.getElementById('precioVentaManual').value = '';

                actualizarTablaPrecios();
                mostrarAlerta('Precio configurado correctamente', 'success');

            } catch (error) {
                mostrarAlerta(`Error al configurar precio: ${error.message}`, 'danger');
            } finally {
                btnConfigurar.disabled = false;
                btnConfigurar.innerHTML = '💾 GUARDAR PRECIO';
            }
        };

        // Actualizar tabla de precios
        function actualizarTablaPrecios() {
            const tbody = document.querySelector('#tablaPrecios tbody');
            tbody.innerHTML = '';

            for (const [tipo, datos] of Object.entries(preciosData)) {
                const fila = tbody.insertRow();
                fila.innerHTML = `
                    <td>${tipo}</td>
                    <td>${formatearPesos(datos.precioCompra)}</td>
                    <td>${datos.margen.toFixed(1)}%</td>
                    <td>${formatearPesos(datos.precioVenta)}</td>
                    <td>${formatearPesos(datos.ganancia)}</td>
                    <td><button class="btn btn-danger" onclick="eliminarPrecio('${tipo}')">Eliminar</button></td>
                `;
            }
        }

        // Eliminar precio
        window.eliminarPrecio = async function(tipo) {
            if (!confirm(`¿Está seguro de eliminar el precio de ${tipo}?`)) {
                return;
            }

            try {
                delete preciosData[tipo];

                const datosPrecios = [
                    ['Tipo', 'PrecioCompra', 'Margen', 'PrecioVenta', 'Ganancia'],
                    ...Object.entries(preciosData).map(([tipoPez, datos]) => [
                        tipoPez,
                        datos.precioCompra,
                        datos.margen,
                        datos.precioVenta,
                        datos.ganancia
                    ])
                ];

                await escribirHoja('Precios', datosPrecios);
                actualizarTablaPrecios();
                mostrarAlerta('Precio eliminado correctamente', 'success');

            } catch (error) {
                mostrarAlerta(`Error al eliminar precio: ${error.message}`, 'danger');
            }
        };

        // =================== FUNCIONES DE VENTAS ===================

        // Cargar inventario para ventas
        function cargarInventarioParaVentas() {
            const select = document.getElementById('tipoPescadoVenta');
            select.innerHTML = '<option value="">Seleccionar...</option>';

            for (const tipo in inventarioData) {
                if (inventarioData[tipo].stock > 0 && preciosData[tipo]) {
                    select.innerHTML += `<option value="${tipo}">${tipo} (${inventarioData[tipo].stock.toFixed(1)} lbs disponibles)</option>`;
                }
            }

            // Event listener para cargar precio automáticamente
            select.addEventListener('change', function() {
                const tipoSeleccionado = this.value;
                const precioInput = document.getElementById('precioVentaProducto');

                if (tipoSeleccionado && preciosData[tipoSeleccionado]) {
                    precioInput.value = preciosData[tipoSeleccionado].precioVenta.toFixed(2);
                } else {
                    precioInput.value = '';
                }
            });
        }

        // Agregar producto a venta
        window.agregarProductoVenta = function() {
            const tipo = document.getElementById('tipoPescadoVenta').value;
            const gramos = parseFloat(document.getElementById('cantidadVenta').value);
            const precio = parseFloat(document.getElementById('precioVentaProducto').value);

            if (!tipo || !gramos || !precio) {
                mostrarAlerta('Complete todos los campos del producto', 'warning');
                return;
            }

            // Convertir gramos a kilos
            const cantidad = gramosAKilogramos(gramos);

            if (cantidad > inventarioData[tipo].stock) {
                mostrarAlerta(`Solo hay ${inventarioData[tipo].stock.toFixed(3)} kg disponibles de ${tipo}`, 'warning');
                return;
            }

            const subtotal = cantidad * precio;

            ventaActual.push({
                tipo: tipo,
                cantidad: cantidad,
                precio: precio,
                subtotal: subtotal
            });

            // Limpiar campos
            document.getElementById('tipoPescadoVenta').value = '';
            document.getElementById('cantidadVenta').value = '';
            document.getElementById('precioVentaProducto').value = '';
            document.getElementById('conversionKilos').textContent = '';

            actualizarTablaVentaActual();
        };

        // Actualizar tabla de venta actual
        function actualizarTablaVentaActual() {
            const tbody = document.querySelector('#tablaVentaActual tbody');
            tbody.innerHTML = '';

            let total = 0;

            ventaActual.forEach((producto, index) => {
                const fila = tbody.insertRow();
                fila.innerHTML = `
                    <td>${producto.tipo}</td>
                    <td>${producto.cantidad.toFixed(3)}</td>
                    <td>${formatearPesos(producto.precio)}</td>
                    <td>${formatearPesos(producto.subtotal)}</td>
                    <td><button class="btn btn-danger" onclick="eliminarProductoVenta(${index})">Eliminar</button></td>
                `;
                total += producto.subtotal;
            });

            // Aplicar descuento si hay
            const descuentoPorKilo = parseFloat(document.getElementById('descuentoPorLibra').value) || 0;
            const totalKilos = ventaActual.reduce((sum, producto) => sum + producto.cantidad, 0);
            const descuentoTotal = descuentoPorKilo * totalKilos;
            const totalConDescuento = total - descuentoTotal;

            document.getElementById('totalVenta').textContent = formatearNumero(totalConDescuento);
            
            // Recalcular cambio si hay efectivo ingresado
            calcularCambio();
        }

        // Calcular cambio para la venta
        window.calcularCambio = function() {
            const subtotal = ventaActual.reduce((sum, producto) => sum + producto.subtotal, 0);
            
            // Aplicar descuento
            const descuentoPorKilo = parseFloat(document.getElementById('descuentoPorLibra').value) || 0;
            const totalKilos = ventaActual.reduce((sum, producto) => sum + producto.cantidad, 0);
            const descuentoTotal = descuentoPorKilo * totalKilos;
            const totalVenta = subtotal - descuentoTotal;
            
            const efectivoRecibido = parseFloat(document.getElementById('efectivoRecibido').value) || 0;
            const alertaCambio = document.getElementById('alertaCambio');
            const cambioDevolver = document.getElementById('cambioDevolver');
            
            if (efectivoRecibido === 0) {
                cambioDevolver.textContent = '0';
                alertaCambio.style.display = 'none';
                return;
            }
            
            const cambio = efectivoRecibido - totalVenta;
            
            if (cambio < 0) {
                cambioDevolver.textContent = '0';
                alertaCambio.style.display = 'block';
                alertaCambio.style.background = '#ffe6e6';
                alertaCambio.style.color = '#d32f2f';
                alertaCambio.style.border = '1px solid #d32f2f';
                alertaCambio.innerHTML = `<strong>⚠️ ADVERTENCIA:</strong> El efectivo recibido es INSUFICIENTE. Faltan: <strong>${formatearPesos(Math.abs(cambio))}</strong>`;
            } else {
                cambioDevolver.textContent = formatearNumero(cambio);
                alertaCambio.style.display = 'block';
                alertaCambio.style.background = '#e8f5e9';
                alertaCambio.style.color = '#2e7d32';
                alertaCambio.style.border = '1px solid #4caf50';
                alertaCambio.innerHTML = `✅ <strong>Cambio correcto:</strong> Devolver ${formatearPesos(cambio)} al cliente`;
            }
        };

        // Eliminar producto de venta
        window.eliminarProductoVenta = function(index) {
            ventaActual.splice(index, 1);
            actualizarTablaVentaActual();
        };

        // Generar factura
        window.generarFactura = async function() {
            if (!isConfigured) {
                mostrarAlerta('Configure el sistema primero', 'warning');
                return;
            }

            if (ventaActual.length === 0) {
                mostrarAlerta('Agregue al menos un producto a la venta', 'warning');
                return;
            }

            const cliente = document.getElementById('nombreCliente').value || 'Cliente General';
            const telefono = document.getElementById('telefonoCliente').value || 'N/A';
            const descuentoPorLibra = parseFloat(document.getElementById('descuentoPorLibra').value) || 0;
            const tipoPago = document.getElementById('tipoPago').value;

            const btnGenerar = document.getElementById('btnGenerarFactura');
            btnGenerar.disabled = true;
            btnGenerar.innerHTML = '<span class="loading"></span> GENERANDO...';

            try {
                // Verificar stock
                for (const producto of ventaActual) {
                    if (producto.cantidad > inventarioData[producto.tipo].stock) {
                        mostrarAlerta(`Stock insuficiente para ${producto.tipo}`, 'danger');
                        return;
                    }
                }

                // Calcular subtotal sin descuento
                const subtotalSinDescuento = ventaActual.reduce((sum, producto) => sum + producto.subtotal, 0);
                
                // Calcular descuento total (descuento por libra * total de libras)
                const totalLibras = ventaActual.reduce((sum, producto) => sum + producto.cantidad, 0);
                const descuentoTotal = descuentoPorLibra * totalLibras;
                
                // Total a pagar
                const total = subtotalSinDescuento - descuentoTotal;

                // Obtener número de factura
                const numeroFactura = await obtenerSiguienteNumeroFactura();

                // Actualizar inventario
                ventaActual.forEach(producto => {
                    inventarioData[producto.tipo].stock -= producto.cantidad;
                    inventarioData[producto.tipo].valorTotal = inventarioData[producto.tipo].stock * inventarioData[producto.tipo].precioPromedio;
                });

                // Guardar venta
                const venta = {
                    numero: numeroFactura,
                    fecha: new Date().toLocaleDateString(),
                    cliente: cliente,
                    telefono: telefono,
                    productos: ventaActual.map(p => `${p.tipo} (${p.cantidad.toFixed(3)} kg)`).join(', '),
                    total: total,
                    descuentoPorLibra: descuentoPorLibra,
                    descuentoTotal: descuentoTotal,
                    subtotalSinDescuento: subtotalSinDescuento,
                    totalLibras: totalLibras,
                    tipoPago: tipoPago
                };

                await Promise.all([
                    guardarVenta(venta),
                    actualizarInventarioEnSheets(),
                    actualizarNumeroFactura(numeroFactura + 1),
                    // Guardar en hoja de Deudas si el pago es "adeuda"
                    ...(tipoPago === 'adeuda' ? [guardarDeuda(venta)] : [])
                ]);

                // Generar HTML de factura
                generarHTMLFactura(venta, ventaActual, cliente, telefono, subtotalSinDescuento, descuentoTotal, descuentoPorLibra, totalLibras);

                // Limpiar venta
                limpiarVenta();

                mostrarAlerta(`Factura #${numeroFactura} generada correctamente`, 'success');

            } catch (error) {
                mostrarAlerta(`Error al generar factura: ${error.message}`, 'danger');
            } finally {
                btnGenerar.disabled = false;
                btnGenerar.innerHTML = 'GENERAR FACTURA';
            }
        };

        // Obtener siguiente número de factura
        async function obtenerSiguienteNumeroFactura() {
            try {
                const datos = await leerHoja('Configuracion');
                let numeroActual = 1;

                if (datos.length > 1 && datos[1][0]) {
                    numeroActual = parseInt(datos[1][0]) || 1;
                }

                return numeroActual;
            } catch (error) {
                return 1;
            }
        }

        // Guardar venta
        async function guardarVenta(venta) {
            const filaNuevaVenta = [
                venta.numero,
                venta.fecha,
                venta.cliente,
                venta.productos,
                venta.total,
                venta.descuentoPorLibra || 0,
                venta.descuentoTotal || 0,
                venta.subtotalSinDescuento || venta.total
            ];

            await agregarFilaHoja('Ventas', filaNuevaVenta);
        }

        // Actualizar inventario en sheets
        async function actualizarInventarioEnSheets() {
            const datosInventario = [
                ['Tipo', 'Stock', 'PrecioPromedio', 'ValorTotal', 'UltimaActualizacion'],
                ...Object.entries(inventarioData).map(([tipoPez, datos]) => [
                    tipoPez,
                    datos.stock,
                    datos.precioPromedio,
                    datos.valorTotal,
                    datos.ultimaActualizacion
                ])
            ];

            await escribirHoja('Inventario', datosInventario);
            actualizarTablaInventario();
        }

        // Actualizar número de factura
        async function actualizarNumeroFactura(nuevoNumero) {
            const datosConfig = [
                ['UltimoNumeroFactura', 'NombreEmpresa', 'DireccionEmpresa', 'TelefonoEmpresa'],
                [nuevoNumero, config.nombreEmpresa, config.direccionEmpresa, config.telefonoEmpresa]
            ];

            await escribirHoja('Configuracion', datosConfig);
        }

        // Guardar deuda
        async function guardarDeuda(venta) {
            const filaDeuda = [
                venta.numero,
                venta.fecha,
                venta.cliente,
                venta.telefono || 'N/A',
                venta.productos,
                venta.total,
                'pendiente', // Estado de la deuda
                '' // FechaPago (vacío hasta que se pague)
            ];

            await agregarFilaHoja('Deudas', filaDeuda);
        }

        // Cargar deudores
        window.cargarDeudores = async function() {
            if (!isConfigured) {
                mostrarAlerta('Configure el sistema primero', 'warning');
                return;
            }

            const btnCargar = document.getElementById('btnCargarDeudores');
            btnCargar.disabled = true;
            btnCargar.innerHTML = '<span class="loading"></span> CARGANDO...';

            try {
                const datos = await leerHoja('Deudas');
                
                if (datos.length <= 1) {
                    document.getElementById('tablaDeudores').querySelector('tbody').innerHTML = `
                        <tr>
                            <td colspan="7" style="text-align: center; padding: 30px; color: #999;">
                                No hay deudores registrados
                            </td>
                        </tr>
                    `;
                    document.getElementById('totalDeuda').textContent = '$0';
                    document.getElementById('cantidadDeudores').textContent = '0';
                    return;
                }

                // Filtrar solo las deudas pendientes
                const deudores = datos.slice(1).filter(row => row[6] === 'pendiente');
                
                let totalDeuda = 0;
                let html = '';
                
                deudores.forEach((deuda, index) => {
                    const [numeroFactura, fecha, cliente, telefono, productos, monto, estado] = deuda;
                    const montoNum = parseFloat(monto) || 0;
                    totalDeuda += montoNum;
                    
                    html += `
                        <tr>
                            <td>${cliente}</td>
                            <td>${telefono}</td>
                            <td>#${numeroFactura}</td>
                            <td>${fecha}</td>
                            <td>${productos}</td>
                            <td style="font-weight: bold; color: #dc3545;">${formatearPesos(montoNum)}</td>
                            <td>
                                <button class="btn btn-success" onclick="pagarDeuda(${index + 1})" 
                                    style="padding: 8px 15px; font-size: 0.9em;">
                                    PAGAR
                                </button>
                            </td>
                        </tr>
                    `;
                });

                document.getElementById('tablaDeudores').querySelector('tbody').innerHTML = html;
                document.getElementById('totalDeuda').textContent = formatearPesos(totalDeuda);
                document.getElementById('cantidadDeudores').textContent = deudores.length;
                
                const statusElement = document.getElementById('deudoresStatus');
                if (statusElement) {
                    statusElement.className = 'connection-status status-connected';
                    statusElement.innerHTML = '<span>✅</span><span>Deudores cargados correctamente</span>';
                }

            } catch (error) {
                mostrarAlerta(`Error al cargar deudores: ${error.message}`, 'danger');
                const statusElement = document.getElementById('deudoresStatus');
                if (statusElement) {
                    statusElement.className = 'connection-status status-disconnected';
                    statusElement.innerHTML = '<span>❌</span><span>Error al cargar deudores</span>';
                }
            } finally {
                btnCargar.disabled = false;
                btnCargar.innerHTML = 'ACTUALIZAR DEUDORES';
            }
        };

        // Pagar deuda
        window.pagarDeuda = async function(filaIndex) {
            if (!confirm('¿Confirmar el pago de esta deuda?')) {
                return;
            }

            try {
                const datos = await leerHoja('Deudas');
                
                // Actualizar el estado a 'pagado' y agregar fecha de pago
                datos[filaIndex][6] = 'pagado';
                datos[filaIndex][7] = new Date().toLocaleDateString(); // FechaPago
                
                // Reescribir toda la hoja con los datos actualizados
                await escribirHoja('Deudas', datos);
                
                mostrarAlerta('Deuda marcada como pagada correctamente', 'success');
                
                // Recargar la lista de deudores
                await cargarDeudores();
                
            } catch (error) {
                mostrarAlerta(`Error al marcar deuda como pagada: ${error.message}`, 'danger');
            }
        };

        // Generar HTML de factura
        function generarHTMLFactura(venta, productos, cliente, telefono, subtotalSinDescuento = 0, descuentoTotal = 0, descuentoPorLibra = 0, totalLibras = 0) {
            const facturaHTML = `
                <div class="factura">
                    <div style="text-align: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px dashed #000;">
                        <h2 style="margin: 5px 0;">🐟 ${config.nombreEmpresa}</h2>
                        <p style="margin: 2px 0; font-size: 0.9em;">${config.direccionEmpresa}</p>
                        <p style="margin: 2px 0; font-size: 0.9em;">📞 ${config.telefonoEmpresa}</p>
                    </div>
                    
                    <div style="text-align: center; margin: 10px 0; padding: 8px 0; border-bottom: 1px dashed #000;">
                        <p style="margin: 2px 0;"><strong>FACTURA #${venta.numero.toString().padStart(6, '0')}</strong></p>
                        <p style="margin: 2px 0; font-size: 0.85em;">Fecha: ${venta.fecha}</p>
                        <p style="margin: 2px 0; font-size: 0.85em;">Hora: ${new Date().toLocaleTimeString()}</p>
                    </div>
                    
                    <div style="margin: 10px 0; padding: 5px 0; border-bottom: 1px dashed #000;">
                        <p style="margin: 2px 0; font-size: 0.9em;"><strong>CLIENTE:</strong></p>
                        <p style="margin: 2px 0; font-size: 0.85em;">${cliente}</p>
                        ${telefono && telefono !== 'N/A' ? `<p style="margin: 2px 0; font-size: 0.85em;">Tel: ${telefono}</p>` : ''}
                    </div>
                    
                    <table style="width: 100%; margin: 10px 0; border-collapse: collapse; font-size: 0.9em;">
                        <thead>
                            <tr style="border-bottom: 2px solid #000;">
                                <th style="padding: 5px 3px; text-align: left;">PRODUCTO</th>
                                <th style="padding: 5px 3px; text-align: center;">CANT</th>
                                <th style="padding: 5px 3px; text-align: right;">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productos.map(producto => `
                                <tr style="border-bottom: 1px dashed #ccc;">
                                    <td style="padding: 5px 3px; text-align: left;">${producto.tipo}</td>
                                    <td style="padding: 5px 3px; text-align: center;">${producto.cantidad.toFixed(3)} kg</td>
                                    <td style="padding: 5px 3px; text-align: right;"><strong>${formatearPesos(producto.subtotal)}</strong></td>
                                </tr>
                                <tr style="border-bottom: 1px dashed #ccc;">
                                    <td colspan="3" style="padding: 2px 3px 5px 20px; font-size: 0.85em; color: #666; text-align: left;">@ ${formatearPesos(producto.precio)}/kg</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div style="text-align: right; padding: 10px 0; margin-top: 10px; border-top: 1px dashed #000;">
                        ${descuentoTotal > 0 ? `
                            <div style="font-size: 0.95em; margin: 5px 0;">
                                <span style="color: #666;">Subtotal:</span> <strong>${formatearPesos(subtotalSinDescuento)}</strong>
                            </div>
                            <div style="font-size: 0.95em; margin: 5px 0; color: #28a745;">
                                <span>Descuento (${formatearPesos(descuentoPorLibra)}/kg × ${totalLibras.toFixed(3)} kg):</span> <strong>-${formatearPesos(descuentoTotal)}</strong>
                            </div>
                            <div style="border-top: 2px solid #000; margin: 8px 0; padding-top: 8px;">
                        ` : '<div style="border-top: 2px solid #000; padding-top: 8px;">'}
                            <div style="font-size: 1.3em; font-weight: bold;">
                                TOTAL A PAGAR: ${formatearPesos(venta.total)}
                            </div>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px dashed #000;">
                        <p style="margin: 5px 0; font-size: 0.85em;">¡Gracias por su compra!</p>
                        <p style="margin: 5px 0; font-size: 0.8em;">Pescado fresco del día</p>
                    </div>
                    
                    <div class="no-print" style="text-align: center; margin-top: 20px;">
                        <button class="btn btn-warning" onclick="window.print()">IMPRIMIR FACTURA</button>
                        <button class="btn" onclick="limpiarFactura()">CERRAR</button>
                    </div>
                </div>
            `;

            document.getElementById('facturaGenerada').innerHTML = facturaHTML;
        }

        // Limpiar venta
        function limpiarVenta() {
            ventaActual = [];
            document.getElementById('nombreCliente').value = '';
            document.getElementById('telefonoCliente').value = '';
            document.getElementById('descuentoPorLibra').value = '0';
            document.getElementById('efectivoRecibido').value = '';
            document.getElementById('cambioDevolver').textContent = '0';
            document.getElementById('alertaCambio').style.display = 'none';
            actualizarTablaVentaActual();
            cargarInventarioParaVentas();
        }

        // Limpiar factura
        window.limpiarFactura = function() {
            document.getElementById('facturaGenerada').innerHTML = '';
        };

        // =================== FUNCIONES DE REPORTES ===================

        // Cargar reportes
        window.cargarReportes = async function() {
            if (!isConfigured) {
                mostrarAlerta('Configure el sistema primero', 'warning');
                return;
            }

            const btnCargar = document.getElementById('btnCargarReportes');
            btnCargar.disabled = true;
            btnCargar.innerHTML = '<span class="loading"></span> CARGANDO...';

            try {
                updateConnectionStatus('loading', 'Cargando reportes...');

                const ventasData = await leerHoja('Ventas');

                if (ventasData.length > 1) {
                    const hoy = new Date().toLocaleDateString();
                    const mesActual = new Date().getMonth();
                    const añoActual = new Date().getFullYear();

                    let totalHoy = 0;
                    let totalMes = 0;
                    let totalHistorico = 0; // Nueva variable para ventas totales
                    let gananciasMes = 0;
                    let gananciasTotal = 0; // Nueva variable para ganancias totales
                    let numeroFacturas = ventasData.length - 1; // -1 por el encabezado

                    // Procesar ventas y guardar datos completos
                    const ventasParaTabla = [];
                    const clientesSet = new Set();
                    const productosSet = new Set();
                    
                    for (let i = 1; i < ventasData.length; i++) {
                        const venta = ventasData[i];
                        if (venta[1] && venta[4]) {
                            const fechaVenta = venta[1];
                            const totalVenta = parseFloat(venta[4]) || 0;
                            const productosTexto = venta[3] || '';
                            const cliente = venta[2] || 'N/A';
                            const descuentoPorLibra = parseFloat(venta[5]) || 0;
                            const descuentoTotal = parseFloat(venta[6]) || 0;
                            const subtotalSinDescuento = parseFloat(venta[7]) || totalVenta;

                            // Agregar a tabla de últimas ventas
                            ventasParaTabla.push({
                                numero: venta[0],
                                fecha: fechaVenta,
                                cliente: cliente,
                                productos: productosTexto,
                                total: totalVenta,
                                descuentoPorLibra: descuentoPorLibra,
                                descuentoTotal: descuentoTotal,
                                subtotalSinDescuento: subtotalSinDescuento
                            });

                            // Agregar clientes únicos
                            if (cliente && cliente !== 'N/A') {
                                clientesSet.add(cliente);
                            }

                            // Extraer productos únicos
                            const productos = productosTexto.split(', ');
                            for (const productoStr of productos) {
                                const producto = parsearProducto(productoStr);
                                if (producto) {
                                    productosSet.add(producto.tipo);
                                }
                            }

                            // Ventas de hoy
                            if (fechaVenta === hoy) {
                                totalHoy += totalVenta;
                            }

                            // Sumar TODAS las ventas al total histórico
                            totalHistorico += totalVenta;

                            // Calcular ganancias para TODAS las ventas (totales)
                            const productosVenta = productosTexto.split(', ');
                            for (const productoStr of productosVenta) {
                                const producto = parsearProducto(productoStr);
                                if (producto && preciosData[producto.tipo]) {
                                    const gananciaPorKilo = preciosData[producto.tipo].ganancia || 0;
                                    
                                    if (producto.unidad === 'lbs') {
                                        // Datos antiguos en libras: dividir el precio entre 2.20462
                                        const gananciaPorLibra = gananciaPorKilo / KILOS_A_LIBRAS;
                                        gananciasTotal += (producto.cantidad * gananciaPorLibra);
                                    } else {
                                        // Datos nuevos en kilos: usar el precio tal cual
                                        gananciasTotal += (producto.cantidad * gananciaPorKilo);
                                    }
                                }
                            }

                            // Ventas del mes y ganancias del mes
                            try {
                                const fecha = new Date(fechaVenta.split('/').reverse().join('-'));
                                if (fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual) {
                                    totalMes += totalVenta;
                                    
                                    // Calcular ganancias del mes
                                    const productosMes = productosTexto.split(', ');
                                    for (const productoStr of productosMes) {
                                        const producto = parsearProducto(productoStr);
                                        if (producto && preciosData[producto.tipo]) {
                                            const gananciaPorKilo = preciosData[producto.tipo].ganancia || 0;
                                            
                                            if (producto.unidad === 'lbs') {
                                                // Datos antiguos en libras: dividir el precio entre 2.20462
                                                const gananciaPorLibra = gananciaPorKilo / KILOS_A_LIBRAS;
                                                gananciasMes += (producto.cantidad * gananciaPorLibra);
                                            } else {
                                                // Datos nuevos en kilos: usar el precio tal cual
                                                gananciasMes += (producto.cantidad * gananciaPorKilo);
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                console.log('Error al procesar fecha:', fechaVenta);
                            }
                        }
                    }

                    // Guardar datos completos para filtros
                    ventasCompletasData = ventasParaTabla;

                    // Poblar filtros
                    poblarFiltrosReportes(clientesSet, productosSet);

                    // Calcular valor total del inventario
                    let totalInventario = 0;
                    for (const tipo in inventarioData) {
                        totalInventario += inventarioData[tipo].valorTotal;
                    }

                    // Actualizar estadísticas
                    document.getElementById('totalVentasHoy').textContent = formatearPesos(totalHoy);
                    document.getElementById('totalVentasMes').textContent = formatearPesos(totalMes);
                    document.getElementById('totalVentasHistorico').textContent = formatearPesos(totalHistorico);
                    document.getElementById('gananciasMes').textContent = formatearPesos(gananciasMes);
                    document.getElementById('gananciasTotal').textContent = formatearPesos(gananciasTotal);
                    document.getElementById('totalInventario').textContent = formatearPesos(totalInventario);
                    // document.getElementById('numeroFacturas').textContent = numeroFacturas; // Removido del diseño

                    // Actualizar tabla de últimas ventas (últimas 10)
                    actualizarTablaUltimasVentas(ventasParaTabla.slice(-10).reverse());

                    // Actualizar tabla de stock bajo
                    actualizarTablaStockBajo();

                    updateConnectionStatus('connected', 'Reportes cargados correctamente');
                    mostrarAlerta('Reportes actualizados correctamente', 'success');

                } else {
                    document.getElementById('totalVentasHoy').textContent = '$0.00';
                    document.getElementById('totalVentasMes').textContent = '$0.00';
                    document.getElementById('totalVentasHistorico').textContent = '$0.00';
                    document.getElementById('gananciasMes').textContent = '$0.00';
                    document.getElementById('gananciasTotal').textContent = '$0.00';
                    // document.getElementById('numeroFacturas').textContent = '0'; // Removido del diseño

                    mostrarAlerta('No hay datos de ventas disponibles', 'warning');
                }

            } catch (error) {
                updateConnectionStatus('disconnected', `Error: ${error.message}`);
                mostrarAlerta(`Error al cargar reportes: ${error.message}`, 'danger');
            } finally {
                btnCargar.disabled = false;
                btnCargar.innerHTML = 'ACTUALIZAR REPORTES';
            }
        };

        // Actualizar tabla de últimas ventas
        function actualizarTablaUltimasVentas(ventas) {
            const tbody = document.querySelector('#tablaUltimasVentas tbody');
            tbody.innerHTML = '';

            if (ventas.length === 0) {
                const fila = tbody.insertRow();
                fila.innerHTML = '<td colspan="6" style="text-align: center;">No hay ventas registradas</td>';
                return;
            }

            ventas.forEach(venta => {
                const fila = tbody.insertRow();
                fila.innerHTML = `
                    <td>#${venta.numero.toString().padStart(6, '0')}</td>
                    <td>${venta.fecha}</td>
                    <td>${venta.cliente}</td>
                    <td>${venta.productos}</td>
                    <td>${formatearPesos(venta.total)}</td>
                    <td style="text-align: center;">
                        <button 
                            class="btn-small" 
                            onclick="regenerarFactura('${venta.numero}', '${venta.fecha}', '${venta.cliente.replace(/'/g, "\\'")}', \`${venta.productos}\`, ${venta.total}, ${venta.descuentoPorLibra || 0}, ${venta.descuentoTotal || 0}, ${venta.subtotalSinDescuento || venta.total})"
                            style="background: #17a2b8; color: white; padding: 5px 10px; border: none; border-radius: 5px; cursor: pointer; font-size: 12px; margin-right: 5px;"
                            title="Ver/Imprimir Factura"
                        >
                            📄 Ver
                        </button>
                        <button 
                            class="btn-small" 
                            onclick="solicitarEliminacionFactura('${venta.numero}', '${venta.fecha}', '${venta.cliente.replace(/'/g, "\\'")}', \`${venta.productos}\`, ${venta.total})"
                            style="background: #dc3545; color: white; padding: 5px 10px; border: none; border-radius: 5px; cursor: pointer; font-size: 12px;"
                            title="Eliminar Factura"
                        >
                            Eliminar
                        </button>
                    </td>
                `;
            });
        }

        // Actualizar tabla de stock bajo
        function actualizarTablaStockBajo() {
            const tbody = document.querySelector('#tablaStockBajo tbody');
            tbody.innerHTML = '';

            const stockBajo = Object.entries(inventarioData).filter(([tipo, datos]) => datos.stock < 10);

            if (stockBajo.length === 0) {
                const fila = tbody.insertRow();
                fila.innerHTML = '<td colspan="3" style="text-align: center;">✅ Todos los productos tienen stock suficiente</td>';
                return;
            }

            stockBajo.forEach(([tipo, datos]) => {
                const fila = tbody.insertRow();

                let estado = '🟡 Stock Bajo';
                let claseEstado = 'style="background-color: #fff3cd;"';

                if (datos.stock === 0) {
                    estado = '🔴 Agotado';
                    claseEstado = 'style="background-color: #f8d7da;"';
                } else if (datos.stock < 5) {
                    estado = '🟠 Crítico';
                    claseEstado = 'style="background-color: #f8d7da;"';
                }

                fila.innerHTML = `
                    <td>${tipo}</td>
                    <td>${parseFloat(datos.stock.toFixed(3))} kg</td>
                    <td ${claseEstado}>${estado}</td>
                `;
            });
        }

        // =================== FUNCIONES DE HISTÓRICO ===================

        let datosHistoricoCompletos = [];

        // Cargar histórico
        window.cargarHistorico = async function() {
            if (!isConfigured) {
                mostrarAlerta('Configure el sistema primero', 'warning');
                return;
            }

            const btnCargar = document.getElementById('btnCargarHistorico');
            btnCargar.disabled = true;
            btnCargar.innerHTML = '<span class="loading"></span> CARGANDO...';

            try {
                updateConnectionStatus('loading', 'Cargando histórico...');

                const historicoData = await leerHoja('Historico');

                if (historicoData.length > 1) {
                    datosHistoricoCompletos = [];

                    // Procesar datos (saltar encabezado)
                    for (let i = 1; i < historicoData.length; i++) {
                        const fila = historicoData[i];
                        if (fila[0]) {
                            datosHistoricoCompletos.push({
                                tipo: fila[0],
                                cantidad: parseFloat(fila[1]) || 0,
                                precioCompra: parseFloat(fila[2]) || 0,
                                proveedor: fila[3] || 'No especificado',
                                fecha: fila[4] || '',
                                valorTotal: parseFloat(fila[5]) || 0
                            });
                        }
                    }

                    // Llenar filtros
                    llenarFiltrosHistorico();

                    // Mostrar todos los datos
                    actualizarTablaHistorico(datosHistoricoCompletos);

                    // Actualizar estadísticas
                    actualizarEstadisticasHistorico(datosHistoricoCompletos);

                    updateConnectionStatus('connected', 'Histórico cargado correctamente');
                    mostrarAlerta(`✅ Histórico cargado: ${datosHistoricoCompletos.length} entradas`, 'success');

                } else {
                    datosHistoricoCompletos = [];
                    document.querySelector('#tablaHistorico tbody').innerHTML = 
                        '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #999;">📦 No hay entradas registradas en el histórico</td></tr>';
                    
                    document.getElementById('totalEntradasHistorico').textContent = '0';
                    document.getElementById('totalLibrasHistorico').textContent = '0';
                    document.getElementById('totalInversionHistorico').textContent = '$0';

                    mostrarAlerta('No hay datos en el histórico', 'warning');
                }

            } catch (error) {
                updateConnectionStatus('disconnected', `Error: ${error.message}`);
                mostrarAlerta(`Error al cargar histórico: ${error.message}`, 'danger');
            } finally {
                btnCargar.disabled = false;
                btnCargar.innerHTML = 'ACTUALIZAR HISTÓRICO';
            }
        };

        // Llenar filtros de histórico
        function llenarFiltrosHistorico() {
            // Filtro de tipo
            const filtroTipo = document.getElementById('filtroTipoHistorico');
            const tipos = [...new Set(datosHistoricoCompletos.map(d => d.tipo))].sort();
            
            filtroTipo.innerHTML = '<option value="">Todos los tipos</option>';
            tipos.forEach(tipo => {
                filtroTipo.innerHTML += `<option value="${tipo}">${tipo}</option>`;
            });

            // Filtro de mes
            const filtroMes = document.getElementById('filtroMesHistorico');
            const meses = [...new Set(datosHistoricoCompletos.map(d => {
                try {
                    const fecha = new Date(d.fecha.split('/').reverse().join('-'));
                    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
                } catch (e) {
                    return '';
                }
            }).filter(m => m))].sort().reverse();

            filtroMes.innerHTML = '<option value="">Todos los meses</option>';
            meses.forEach(mes => {
                const [año, mesNum] = mes.split('-');
                const nombreMes = new Date(año, parseInt(mesNum) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                filtroMes.innerHTML += `<option value="${mes}">${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}</option>`;
            });
        }

        // Filtrar histórico
        function filtrarHistorico() {
            const filtroTipo = document.getElementById('filtroTipoHistorico').value;
            const filtroMes = document.getElementById('filtroMesHistorico').value;

            let datosFiltrados = [...datosHistoricoCompletos];

            // Filtrar por tipo
            if (filtroTipo) {
                datosFiltrados = datosFiltrados.filter(d => d.tipo === filtroTipo);
            }

            // Filtrar por mes
            if (filtroMes) {
                datosFiltrados = datosFiltrados.filter(d => {
                    try {
                        const fecha = new Date(d.fecha.split('/').reverse().join('-'));
                        const mesFecha = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
                        return mesFecha === filtroMes;
                    } catch (e) {
                        return false;
                    }
                });
            }

            actualizarTablaHistorico(datosFiltrados);
            actualizarEstadisticasHistorico(datosFiltrados);
        }

        // Actualizar tabla de histórico
        function actualizarTablaHistorico(datos) {
            const tbody = document.querySelector('#tablaHistorico tbody');
            tbody.innerHTML = '';

            if (datos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #999;">🔍 No hay registros que coincidan con los filtros</td></tr>';
                return;
            }

            // Ordenar por fecha descendente (más reciente primero)
            datos.sort((a, b) => {
                try {
                    const fechaA = new Date(a.fecha.split('/').reverse().join('-'));
                    const fechaB = new Date(b.fecha.split('/').reverse().join('-'));
                    return fechaB - fechaA;
                } catch (e) {
                    return 0;
                }
            });

            datos.forEach(entrada => {
                const fila = tbody.insertRow();
                fila.innerHTML = `
                    <td>${entrada.fecha}</td>
                    <td><strong>${entrada.tipo}</strong></td>
                    <td style="text-align: center;">${entrada.cantidad.toFixed(1)} lbs</td>
                    <td style="text-align: right;">${formatearPesos(entrada.precioCompra)}</td>
                    <td>${entrada.proveedor}</td>
                    <td style="text-align: right;"><strong>${formatearPesos(entrada.valorTotal)}</strong></td>
                `;
            });
        }

        // Actualizar estadísticas del histórico
        function actualizarEstadisticasHistorico(datos) {
            const totalEntradas = datos.length;
            const totalLibras = datos.reduce((sum, d) => sum + d.cantidad, 0);
            const totalInversion = datos.reduce((sum, d) => sum + d.valorTotal, 0);

            document.getElementById('totalEntradasHistorico').textContent = totalEntradas;
            document.getElementById('totalLibrasHistorico').textContent = totalLibras.toFixed(1) + ' lbs';
            document.getElementById('totalInversionHistorico').textContent = formatearPesos(totalInversion);
        }

        // =================== INICIALIZACIÓN ===================

        // Cargar configuración guardada al iniciar
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🎯 DOM cargado, inicializando sistema...');
            verificarSesion();

            // Cargar configuración guardada
            if (spreadsheetId) {
                document.getElementById('spreadsheetId').value = spreadsheetId;
                updateConnectionStatus('connected', 'Configuración cargada desde localStorage');
                //cargarTodosLosDatos();
            } else {
                updateConnectionStatus('disconnected', 'Configure el sistema para comenzar');
            }

            // Cargar datos de empresa
            document.getElementById('nombreEmpresa').value = config.nombreEmpresa;
            document.getElementById('direccionEmpresa').value = config.direccionEmpresa;
            document.getElementById('telefonoEmpresa').value = config.telefonoEmpresa;

            console.log('✅ Sistema inicializado correctamente');
        });

        console.log('🎯 Todas las funciones definidas correctamente');

        // =================== FUNCIONES DE AUTENTICACIÓN ===================

        // Credenciales del sistema
        const USUARIO_VALIDO = 'pesquera';
        const CONTRASEÑA_VALIDA = 'gloria11';

        // Variables de sesión
        let sesionActiva = localStorage.getItem('sesionPesquera') === 'true';

        // Función para alternar visibilidad de contraseña
        function togglePassword() {
            const passwordInput = document.getElementById('password');
            const showPasswordCheckbox = document.getElementById('showPassword');

            if (showPasswordCheckbox.checked) {
                passwordInput.type = 'text';
            } else {
                passwordInput.type = 'password';
            }
        }

        // Función para iniciar sesión
        function iniciarSesion(event) {
            event.preventDefault();

            const usuario = document.getElementById('username').value.trim();
            const contraseña = document.getElementById('password').value;
            const loginBtn = document.getElementById('loginBtn');
            const errorDiv = document.getElementById('loginError');

            // Deshabilitar botón y mostrar carga
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="loading"></span> VERIFICANDO...';

            // Simular verificación
            setTimeout(() => {
                if (usuario === USUARIO_VALIDO && contraseña === CONTRASEÑA_VALIDA) {
                    // Login exitoso
                    localStorage.setItem('sesionPesquera', 'true');
                    localStorage.setItem('ultimoLogin', new Date().toISOString());

                    mostrarSistema();

                    // Limpiar formulario
                    document.getElementById('username').value = '';
                    document.getElementById('password').value = '';
                    errorDiv.style.display = 'none';

                } else {
                    // Login fallido
                    errorDiv.textContent = '❌ Usuario o contraseña incorrectos';
                    errorDiv.style.display = 'block';

                    // Limpiar contraseña
                    document.getElementById('password').value = '';
                    document.getElementById('password').focus();
                }

                // Restaurar botón
                loginBtn.disabled = false;
                loginBtn.innerHTML = '🔑 INICIAR SESIÓN';

            }, 1000);
        }

        // Función para mostrar el sistema principal
        function mostrarSistema() {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('sistemaPrincipal').style.display = 'block';

            console.log('✅ Sesión iniciada correctamente');

            // Cargar datos si ya está configurado
            if (spreadsheetId) {
                cargarTodosLosDatos();
            }
        }

        // Función para cerrar sesión
        function cerrarSesion() {
            if (confirm('¿Está seguro que desea cerrar sesión?')) {
                localStorage.removeItem('sesionPesquera');
                localStorage.removeItem('ultimoLogin');

                document.getElementById('sistemaPrincipal').style.display = 'none';
                document.getElementById('loginScreen').style.display = 'flex';

                // Limpiar datos sensibles
                ventaActual = [];

                console.log('🚪 Sesión cerrada correctamente');
            }
        }

        // Función para verificar sesión al cargar la página (8 horas de duración)
        function verificarSesion() {
            const sesionGuardada = localStorage.getItem('sesionPesquera') === 'true';
            const ultimoLogin = localStorage.getItem('ultimoLogin');

            if (sesionGuardada && ultimoLogin) {
                const tiempoLogin = new Date(ultimoLogin);
                const ahora = new Date();
                const diferenciaHoras = (ahora - tiempoLogin) / (1000 * 60 * 60);

                // Sesión válida por 8 horas
                if (diferenciaHoras < 8) {
                    mostrarSistema();
                    return;
                } else {
                    // Sesión expirada
                    localStorage.removeItem('sesionPesquera');
                    localStorage.removeItem('ultimoLogin');
                }
            }

            // Mostrar login por defecto
            document.getElementById('loginScreen').style.display = 'flex';
            document.getElementById('sistemaPrincipal').style.display = 'none';
        }

        // =================== FUNCIONES DE FILTRADO DE REPORTES ===================

        // Poblar los filtros con los datos únicos
        function poblarFiltrosReportes(clientesSet, productosSet) {
            // Normalizar nombres de clientes (convertir a formato capitalizado)
            const clientesNormalizados = new Map();
            Array.from(clientesSet).forEach(cliente => {
                // Capitalizar: primera letra en mayúscula, resto en minúscula
                const nombreNormalizado = cliente.charAt(0).toUpperCase() + cliente.slice(1).toLowerCase();
                clientesNormalizados.set(nombreNormalizado, nombreNormalizado);
            });

            // Poblar datalist de clientes
            const listaClientes = document.getElementById('listaClientes');
            listaClientes.innerHTML = '';
            const clientesOrdenados = Array.from(clientesNormalizados.keys()).sort();
            clientesOrdenados.forEach(cliente => {
                listaClientes.innerHTML += `<option value="${cliente}">`;
            });

            // Poblar filtro de productos
            const filtroProducto = document.getElementById('filtroProducto');
            filtroProducto.innerHTML = '<option value="">Todos los productos</option>';
            const productosOrdenados = Array.from(productosSet).sort();
            productosOrdenados.forEach(producto => {
                filtroProducto.innerHTML += `<option value="${producto}">${producto}</option>`;
            });
        }

        // Aplicar filtros a los reportes
        function aplicarFiltrosReportes() {
            if (ventasCompletasData.length === 0) {
                return;
            }

            // Obtener valores de filtros
            const filtroFechaDesde = document.getElementById('filtroFechaDesde').value;
            const filtroFechaHasta = document.getElementById('filtroFechaHasta').value;
            const filtroCliente = document.getElementById('filtroCliente').value.trim();
            const filtroProducto = document.getElementById('filtroProducto').value;

            // Filtrar datos
            let datosFiltrados = ventasCompletasData.filter(venta => {
                // Filtro por fecha
                if (filtroFechaDesde || filtroFechaHasta) {
                    try {
                        const fechaVenta = new Date(venta.fecha.split('/').reverse().join('-'));
                        
                        if (filtroFechaDesde) {
                            const fechaDesde = new Date(filtroFechaDesde);
                            if (fechaVenta < fechaDesde) return false;
                        }
                        
                        if (filtroFechaHasta) {
                            const fechaHasta = new Date(filtroFechaHasta);
                            fechaHasta.setHours(23, 59, 59, 999); // Incluir todo el día
                            if (fechaVenta > fechaHasta) return false;
                        }
                    } catch (e) {
                        console.log('Error al filtrar por fecha:', venta.fecha);
                        return false;
                    }
                }

                // Filtro por cliente (comparación normalizada sin case-sensitive y búsqueda parcial)
                if (filtroCliente) {
                    const clienteVentaNormalizado = venta.cliente.toLowerCase();
                    const filtroClienteNormalizado = filtroCliente.toLowerCase();
                    
                    // Buscar si el nombre contiene el texto del filtro
                    if (!clienteVentaNormalizado.includes(filtroClienteNormalizado)) {
                        return false;
                    }
                }

                // Filtro por producto
                if (filtroProducto && !venta.productos.includes(filtroProducto)) {
                    return false;
                }

                return true;
            });

            // Actualizar tabla con datos filtrados
            actualizarTablaUltimasVentas(datosFiltrados.slice().reverse());

            // Actualizar estadísticas con datos filtrados
            actualizarEstadisticasFiltradas(datosFiltrados);

            // Mostrar mensaje si hay filtros activos
            const hayFiltrosActivos = filtroFechaDesde || filtroFechaHasta || filtroCliente || filtroProducto;
            
            if (hayFiltrosActivos) {
                mostrarAlerta(`Mostrando ${datosFiltrados.length} de ${ventasCompletasData.length} ventas`, 'info');
            }
        }

        // Actualizar estadísticas con datos filtrados
        function actualizarEstadisticasFiltradas(datosFiltrados) {
            const hoy = new Date().toLocaleDateString();
            const mesActual = new Date().getMonth();
            const añoActual = new Date().getFullYear();

            let totalHoy = 0;
            let totalMes = 0;
            let gananciasMes = 0;
            let numeroFacturas = datosFiltrados.length;

            datosFiltrados.forEach(venta => {
                // Ventas de hoy
                if (venta.fecha === hoy) {
                    totalHoy += venta.total;
                }

                // Ventas del mes
                try {
                    const fecha = new Date(venta.fecha.split('/').reverse().join('-'));
                    if (fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual) {
                        totalMes += venta.total;
                        
                        // Calcular ganancias
                        const productos = venta.productos.split(', ');
                        for (const productoStr of productos) {
                            const match = productoStr.match(/^(.+?)\s*\(([0-9.]+)\s*lbs\)$/);
                            if (match) {
                                const tipoPescado = match[1].trim();
                                const cantidad = parseFloat(match[2]);
                                
                                if (preciosData[tipoPescado]) {
                                    const gananciaPorLibra = preciosData[tipoPescado].ganancia || 0;
                                    gananciasMes += (cantidad * gananciaPorLibra);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.log('Error al procesar fecha:', venta.fecha);
                }
            });

            // Calcular valor total del inventario (no afectado por filtros)
            let totalInventario = 0;
            for (const tipo in inventarioData) {
                totalInventario += inventarioData[tipo].valorTotal;
            }

            // Actualizar estadísticas en la UI
            document.getElementById('totalVentasHoy').textContent = formatearPesos(totalHoy);
            document.getElementById('totalVentasMes').textContent = formatearPesos(totalMes);
            document.getElementById('gananciasMes').textContent = formatearPesos(gananciasMes);
            document.getElementById('totalInventario').textContent = formatearPesos(totalInventario);
            document.getElementById('numeroFacturas').textContent = numeroFacturas;
        }

        // Limpiar todos los filtros
        function limpiarFiltrosReportes() {
            document.getElementById('filtroFechaDesde').value = '';
            document.getElementById('filtroFechaHasta').value = '';
            document.getElementById('filtroCliente').value = '';
            document.getElementById('filtroProducto').value = '';

            // Volver a mostrar todos los datos
            if (ventasCompletasData.length > 0) {
                actualizarTablaUltimasVentas(ventasCompletasData.slice(-10).reverse());
                aplicarFiltrosReportes(); // Recalcular estadísticas
                mostrarAlerta('Filtros limpiados', 'success');
            }
        }

        // =================== REGENERAR FACTURA ===================

        // Función para regenerar y mostrar una factura anterior
        function regenerarFactura(numero, fecha, cliente, productosTexto, total, descuentoPorLibra = 0, descuentoTotal = 0, subtotalSinDescuento = 0) {
            // Parsear los productos del texto
            // Formato esperado: "Pargo (2.500 kg)" o "Pargo (2.5 lbs)" para históricos
            const productosArray = [];
            const productos = productosTexto.split(', ');
            let totalLibrasCalculado = 0;
            
            for (const productoStr of productos) {
                // Intentar primero con kilogramos (formato nuevo)
                let match = productoStr.match(/^(.+?)\s*\(([0-9.]+)\s*kg\)$/);
                let unidad = 'kg';
                
                // Si no coincide, intentar con libras (formato histórico)
                if (!match) {
                    match = productoStr.match(/^(.+?)\s*\(([0-9.]+)\s*lbs?\)$/);
                    unidad = 'lbs';
                }
                
                if (match) {
                    const tipoPescado = match[1].trim();
                    const cantidad = parseFloat(match[2]);
                    totalLibrasCalculado += cantidad;
                    
                    // Obtener precio del producto (si existe en preciosData)
                    let precioUnitario = 0;
                    if (preciosData[tipoPescado]) {
                        precioUnitario = preciosData[tipoPescado].precioVenta || 0;
                    }
                    
                    productosArray.push({
                        tipo: tipoPescado,
                        cantidad: cantidad,
                        precio: precioUnitario,
                        subtotal: cantidad * precioUnitario,
                        unidad: unidad
                    });
                }
            }

            // Si no hay subtotal guardado, usar el total
            if (subtotalSinDescuento === 0 || subtotalSinDescuento === total) {
                subtotalSinDescuento = total + descuentoTotal;
            }

            // Crear objeto de venta
            const venta = {
                numero: numero,
                fecha: fecha,
                total: total
            };

            // Generar HTML de la factura en formato térmico
            const facturaHTML = `
                <div class="factura">
                    <div style="text-align: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px dashed #000;">
                        <h2 style="margin: 5px 0;">🐟 ${config.nombreEmpresa}</h2>
                        <p style="margin: 2px 0; font-size: 0.9em;">${config.direccionEmpresa}</p>
                        <p style="margin: 2px 0; font-size: 0.9em;">📞 ${config.telefonoEmpresa}</p>
                    </div>
                    
                    <div style="text-align: center; margin: 10px 0; padding: 8px 0; border-bottom: 1px dashed #000;">
                        <p style="margin: 2px 0;"><strong>FACTURA #${numero.toString().padStart(6, '0')}</strong></p>
                        <p style="margin: 2px 0; font-size: 0.85em;">Fecha: ${fecha}</p>
                        <p style="margin: 5px 0; color: #e74c3c; font-weight: bold; font-size: 0.9em;">⚠️ REIMPRESIÓN</p>
                    </div>
                    
                    <div style="margin: 10px 0; padding: 5px 0; border-bottom: 1px dashed #000;">
                        <p style="margin: 2px 0; font-size: 0.9em;"><strong>CLIENTE:</strong></p>
                        <p style="margin: 2px 0; font-size: 0.85em;">${cliente}</p>
                    </div>
                    
                    <table style="width: 100%; margin: 10px 0; border-collapse: collapse; font-size: 0.9em;">
                        <thead>
                            <tr style="border-bottom: 2px solid #000;">
                                <th style="padding: 5px 3px; text-align: left;">PRODUCTO</th>
                                <th style="padding: 5px 3px; text-align: center;">CANT</th>
                                <th style="padding: 5px 3px; text-align: right;">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productosArray.map(producto => `
                                <tr style="border-bottom: 1px dashed #ccc;">
                                    <td style="padding: 5px 3px; text-align: left;">${producto.tipo}</td>
                                    <td style="padding: 5px 3px; text-align: center;">${producto.cantidad.toFixed(producto.unidad === 'kg' ? 3 : 1)} ${producto.unidad}</td>
                                    <td style="padding: 5px 3px; text-align: right;"><strong>${formatearPesos(producto.subtotal)}</strong></td>
                                </tr>
                                <tr style="border-bottom: 1px dashed #ccc;">
                                    <td colspan="3" style="padding: 2px 3px 5px 20px; font-size: 0.85em; color: #666; text-align: left;">@ ${formatearPesos(producto.precio)}/${producto.unidad}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div style="text-align: right; padding: 10px 0; margin-top: 10px; border-top: 1px dashed #000;">
                        ${descuentoTotal > 0 ? `
                            <div style="font-size: 0.95em; margin: 5px 0;">
                                <span style="color: #666;">Subtotal:</span> <strong>${formatearPesos(subtotalSinDescuento)}</strong>
                            </div>
                            <div style="font-size: 0.95em; margin: 5px 0; color: #28a745;">
                                <span>Descuento (${formatearPesos(descuentoPorLibra)}/${productosArray[0]?.unidad || 'kg'} × ${totalLibrasCalculado.toFixed(productosArray[0]?.unidad === 'kg' ? 3 : 1)} ${productosArray[0]?.unidad || 'kg'}):</span> <strong>-${formatearPesos(descuentoTotal)}</strong>
                            </div>
                            <div style="border-top: 2px solid #000; margin: 8px 0; padding-top: 8px;">
                        ` : '<div style="border-top: 2px solid #000; padding-top: 8px;">'}
                            <div style="font-size: 1.3em; font-weight: bold;">
                                TOTAL: ${formatearPesos(total)}
                            </div>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px dashed #000;">
                        <p style="margin: 5px 0; font-size: 0.85em;">¡Gracias por su compra!</p>
                        <p style="margin: 5px 0; font-size: 0.8em;">Pescado fresco del día</p>
                    </div>
                    
                    <div class="no-print" style="text-align: center; margin-top: 20px;">
                        <button class="btn btn-warning" onclick="window.print()">IMPRIMIR FACTURA</button>
                        <button class="btn" onclick="cerrarFacturaRegenerada()">CERRAR</button>
                    </div>
                </div>
            `;

            // Abrir en nueva ventana
            const ventanaFactura = window.open('', '_blank', 'width=800,height=600');
            ventanaFactura.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Factura #${numero.toString().padStart(6, '0')}</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            padding: 20px;
                            max-width: 800px;
                            margin: 0 auto;
                        }
                        .factura {
                            background: white;
                            padding: 30px;
                        }
                        @media print {
                            @page {
                                size: 80mm auto;
                                margin: 0;
                            }
                            
                            body {
                                margin: 0;
                                padding: 0;
                            }
                            
                            .factura {
                                width: 80mm !important;
                                max-width: 80mm !important;
                                margin: 0 !important;
                                padding: 5mm !important;
                                font-size: 10pt !important;
                            }
                            
                            .factura h2 {
                                font-size: 14pt !important;
                                margin: 5px 0 !important;
                            }
                            
                            .factura p {
                                font-size: 9pt !important;
                                margin: 2px 0 !important;
                                line-height: 1.3 !important;
                            }
                            
                            .factura table {
                                font-size: 9pt !important;
                                width: 100% !important;
                            }
                            
                            .factura th {
                                font-size: 9pt !important;
                                padding: 3px 2px !important;
                            }
                            
                            .factura td {
                                font-size: 9pt !important;
                                padding: 3px 2px !important;
                            }
                            
                            .no-print {
                                display: none !important;
                            }
                        }
                        .btn {
                            padding: 10px 20px;
                            margin: 5px;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 14px;
                        }
                        .btn-warning {
                            background: #ffc107;
                            color: #000;
                        }
                    </style>
                </head>
                <body>
                    ${facturaHTML}
                    <script>
                        function cerrarFacturaRegenerada() {
                            window.close();
                        }
                    <\/script>
                </body>
                </html>
            `);
            ventanaFactura.document.close();
        }

        // =================== ELIMINACIÓN DE FACTURAS ===================

        // Contraseña para eliminar facturas
        const CONTRASEÑA_ELIMINACION = 'alejandra26';

        // Función para solicitar eliminación de factura
        function solicitarEliminacionFactura(numero, fecha, cliente, productosTexto, total) {
            // Crear modal de confirmación
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;

            modal.innerHTML = `
                <div style="background: white; padding: 30px; border-radius: 15px; max-width: 500px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                    <h3 style="color: #dc3545; margin-bottom: 20px; text-align: center;">
                        ⚠️ ELIMINAR FACTURA #${numero.toString().padStart(6, '0')}
                    </h3>
                    
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <p style="margin: 5px 0;"><strong>Cliente:</strong> ${cliente}</p>
                        <p style="margin: 5px 0;"><strong>Fecha:</strong> ${fecha}</p>
                        <p style="margin: 5px 0;"><strong>Total:</strong> ${formatearPesos(total)}</p>
                        <p style="margin: 5px 0;"><strong>Productos:</strong> ${productosTexto}</p>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold;">Motivo de eliminación:</label>
                        <select id="motivoEliminacion" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 5px; font-size: 14px;">
                            <option value="">Seleccionar motivo...</option>
                            <option value="Error">Error en la venta</option>
                            <option value="Devolución">Devolución del cliente</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold;">Contraseña de autorización:</label>
                        <input 
                            type="password" 
                            id="contraseñaEliminacion" 
                            placeholder="Ingrese la contraseña"
                            style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 5px; font-size: 14px;"
                        >
                    </div>

                    <div id="errorEliminacion" style="color: #dc3545; margin-bottom: 15px; display: none; text-align: center; font-weight: bold;"></div>

                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button 
                            onclick="confirmarEliminacionFactura('${numero}', '${fecha}', '${cliente.replace(/'/g, "\\'")}', \`${productosTexto}\`, ${total})"
                            style="background: #dc3545; color: white; padding: 12px 25px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 14px;"
                        >
                            ELIMINAR
                        </button>
                        <button 
                            onclick="cerrarModalEliminacion()"
                            style="background: #6c757d; color: white; padding: 12px 25px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 14px;"
                        >
                            ❌ CANCELAR
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            
            // Focus en el select de motivo
            setTimeout(() => document.getElementById('motivoEliminacion').focus(), 100);
        }

        // Función para cerrar el modal de eliminación
        function cerrarModalEliminacion() {
            const modal = document.querySelector('div[style*="position: fixed"]');
            if (modal) {
                modal.remove();
            }
        }

        // Función para confirmar eliminación
        async function confirmarEliminacionFactura(numero, fecha, cliente, productosTexto, total) {
            const motivo = document.getElementById('motivoEliminacion').value;
            const contraseña = document.getElementById('contraseñaEliminacion').value;
            const errorDiv = document.getElementById('errorEliminacion');

            // Validar motivo
            if (!motivo) {
                errorDiv.textContent = '⚠️ Debe seleccionar un motivo';
                errorDiv.style.display = 'block';
                return;
            }

            // Validar contraseña
            if (contraseña !== CONTRASEÑA_ELIMINACION) {
                errorDiv.textContent = '❌ Contraseña incorrecta';
                errorDiv.style.display = 'block';
                document.getElementById('contraseñaEliminacion').value = '';
                document.getElementById('contraseñaEliminacion').focus();
                return;
            }

            // Confirmar acción
            if (!confirm(`¿Está SEGURO que desea eliminar la factura #${numero.toString().padStart(6, '0')}?\n\nEsta acción:\n- Devolverá los productos al inventario\n- Eliminará la venta de los registros\n- Se guardará en el historial de eliminaciones\n\n¿Continuar?`)) {
                return;
            }

            try {
                // Deshabilitar botones
                const botones = document.querySelectorAll('button');
                botones.forEach(btn => btn.disabled = true);

                // Mostrar cargando
                errorDiv.textContent = '⏳ Procesando eliminación... Por favor espere.';
                errorDiv.style.color = '#ffc107';
                errorDiv.style.display = 'block';

                await eliminarFactura(numero, fecha, cliente, productosTexto, total, motivo);

                // Cerrar modal
                document.querySelector('div[style*="position: fixed"]').remove();

                mostrarAlerta('✅ Factura eliminada exitosamente. Inventario y reportes actualizados.', 'success');

                // Recargar datos (con espera entre llamadas)
                setTimeout(async () => {
                    try {
                        await cargarInventario();
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await cargarReportes();
                    } catch (error) {
                        console.error('Error al recargar datos:', error);
                        mostrarAlerta('⚠️ Factura eliminada pero hubo un error al recargar. Actualice la página.', 'warning');
                    }
                }, 1000);

            } catch (error) {
                errorDiv.textContent = '❌ Error: ' + error.message;
                errorDiv.style.color = '#dc3545';
                errorDiv.style.display = 'block';
                
                // Log completo para debugging
                console.error('Error completo al eliminar factura:', error);
                console.error('Stack:', error.stack);
                
                // Rehabilitar botones
                const botones = document.querySelectorAll('button');
                botones.forEach(btn => btn.disabled = false);
                
                // Mensajes más específicos según el tipo de error
                let mensajeUsuario = error.message;
                if (error.message.includes('JSONP')) {
                    mensajeUsuario = '❌ Error de conexión con Google Sheets. Verifique:\n' +
                                   '1. La URL del Apps Script está correcta\n' +
                                   '2. El script está publicado como Web App\n' +
                                   '3. Los permisos están configurados correctamente';
                } else if (error.message.includes('Timeout')) {
                    mensajeUsuario = '❌ La operación tomó demasiado tiempo. Intente nuevamente.';
                }
                
                mostrarAlerta(mensajeUsuario, 'danger');
            }
        }

        // Función principal para eliminar factura
        async function eliminarFactura(numero, fecha, cliente, productosTexto, total, motivo) {
            if (!isConfigured) {
                throw new Error('Sistema no configurado');
            }

            console.log('🗑️ Iniciando proceso de eliminación de factura #' + numero);

            // 1. Parsear productos para devolver al inventario
            const productos = productosTexto.split(', ');
            const productosDevueltos = [];

            for (const productoStr of productos) {
                const match = productoStr.match(/^(.+?)\s*\(([0-9.]+)\s*lbs\)$/);
                if (match) {
                    const tipoPescado = match[1].trim();
                    const cantidad = parseFloat(match[2]);
                    productosDevueltos.push({ tipo: tipoPescado, cantidad: cantidad });
                }
            }

            console.log('📦 Productos a devolver:', productosDevueltos);

            // 2. Leer inventario actual
            console.log('📖 Leyendo inventario actual...');
            const inventarioData = await leerHoja('Inventario');
            const nuevasFilasInventario = [];

            // Copiar encabezados
            if (inventarioData.length > 0) {
                nuevasFilasInventario.push(inventarioData[0]);
            }

            // Actualizar inventario devolviendo productos
            // Estructura: Tipo, Stock, PrecioPromedio, ValorTotal, UltimaActualizacion
            for (let i = 1; i < inventarioData.length; i++) {
                const fila = inventarioData[i];
                const tipo = fila[0];
                let stock = parseFloat(fila[1]) || 0;
                const precioPromedio = parseFloat(fila[2]) || 0;

                // Buscar si este producto fue vendido en la factura
                const productoDevuelto = productosDevueltos.find(p => p.tipo === tipo);
                if (productoDevuelto) {
                    // Devolver al inventario
                    stock += productoDevuelto.cantidad;
                    console.log(`✅ Devolviendo ${productoDevuelto.cantidad} lbs de ${tipo} al inventario (nuevo stock: ${stock})`);
                }

                // Recalcular valor total
                const valorTotal = stock * precioPromedio;
                const fechaActualizacion = new Date().toLocaleDateString();

                nuevasFilasInventario.push([
                    tipo,
                    stock,
                    precioPromedio,
                    valorTotal,
                    fechaActualizacion
                ]);
            }

            // 3. Preparar registro de eliminación
            const fechaEliminacion = new Date().toLocaleDateString();
            const horaEliminacion = new Date().toLocaleTimeString();

            const registroEliminacion = [
                numero,
                fecha,
                cliente,
                productosTexto,
                total,
                motivo,
                fechaEliminacion,
                horaEliminacion
            ];

            // 4. Usar operación combinada optimizada
            // Esto evita enviar las 126 filas de ventas por la URL
            try {
                console.log('💾 Ejecutando operación combinada optimizada...');
                console.log('📊 Tamaño de inventario:', nuevasFilasInventario.length, 'filas');
                console.log('🎯 Factura a eliminar:', numero);
                
                const resultado = await llamarAPIConJSONP({
                    action: 'actualizarInventarioYEliminarVenta',
                    spreadsheetId: spreadsheetId,
                    inventarioNuevo: nuevasFilasInventario,
                    numeroFactura: numero.toString(),
                    registroEliminacion: registroEliminacion
                });
                
                console.log('✅ Resultado:', resultado);
                
                if (resultado.error) {
                    throw new Error(resultado.error);
                }
                
                console.log('✅ Factura eliminada exitosamente y todos los cambios guardados');
                
            } catch (error) {
                console.error('❌ Error crítico durante la eliminación:', error);
                throw new Error(`No se pudieron guardar todos los cambios: ${error.message}`);
            }
        }
