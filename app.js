// =================== CONFIGURACIÓN INICIAL ===================
        console.log('Iniciando PESQUERA RINCON DEL MAR...');

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


// Variables globales Supabase (embebidas en el código)
const SUPABASE_URL = 'https://dhkxczscyoahwjeatxku.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gGt-6YDxdZnWAVoDFEeBvw_V0Cctg8J';

let supabaseUrl = SUPABASE_URL;
let supabaseAnonKey = SUPABASE_ANON_KEY;
let supabaseClient = null;

// Variables globales del sistema
let isConfigured = false;
        let ventaActual = [];
        let inventarioData = {};
        let preciosData = {};
        
        // Variables para reportes
        let ventasCompletasData = []; // Almacenará todas las ventas sin filtrar

        // Datos de gastos
        let gastosData = [];

        // Configuración de empresa
        let config = {
            nombreEmpresa: localStorage.getItem('nombreEmpresa') || 'Pesquera Rincon del Mar',
            direccionEmpresa: localStorage.getItem('direccionEmpresa') || 'Dirección de la empresa',
            telefonoEmpresa: localStorage.getItem('telefonoEmpresa') || '(000) 000-0000'
        };

        // =================== CONSTANTES DE CONVERSIÓN ===================
        const LIBRAS_A_KILOS = 0.5; //
        const KILOS_A_LIBRAS = 2.0; // 

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
            
            return null;
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
                'gastosStatus',
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
            if (seccionId === 'gastos' && isConfigured) {
                prepararGastosUI();
                cargarGastos(); // async, no bloqueante
            }
        };

        // =================== FUNCIONES DE API (SUPABASE) ===================

function _ensureSupabase() {
    if (!window.supabase) {
        throw new Error('Supabase JS no está cargado. Verifica el <script> de supabase-js en index.html');
    }
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Configure Supabase (URL y Anon Key) primero');
    }

    // Evitar múltiples instancias de GoTrueClient en el mismo navegador.
    // Guardamos un singleton en window y solo recreamos si cambian URL/KEY.
    const configKey = `${supabaseUrl}|${supabaseAnonKey}`;
    if (window.__pesqueraSupabaseClient && window.__pesqueraSupabaseClient.__configKey === configKey) {
        supabaseClient = window.__pesqueraSupabaseClient;
        return supabaseClient;
    }

    if (!supabaseClient || supabaseClient.__configKey !== configKey) {
        // Usamos Supabase Auth + RLS (solo usuarios autenticados)
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                // Mantener sesión para no pedir login cada vez
                persistSession: true,
                autoRefreshToken: true,
                // storageKey único del sistema para evitar colisiones con otros proyectos en el mismo navegador
                storageKey: 'pesquera_auth'
            }
        });
        supabaseClient.__configKey = configKey;
        window.__pesqueraSupabaseClient = supabaseClient;
    }
    return supabaseClient;
}

// =================== HELPERS FECHA/CONFIG ===================
function _toISO(value) {
    // Convierte a ISO si es posible; si no, usa "now" para evitar RangeError
    if (!value) return new Date().toISOString();
    const d = new Date(value);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
}

// Formatear fecha ISO o dd/mm/yyyy para UI (sin romper por fechas inválidas)
function _formatFecha(value) {
    try {
        if (!value) return '';
        const d = new Date(value);
        if (isNaN(d.getTime())) {
            // Intentar dd/mm/yyyy
            const parts = String(value).split('/');
            if (parts.length === 3) {
                const dd = parts[0].padStart(2,'0');
                const mm = parts[1].padStart(2,'0');
                const yyyy = parts[2];
                const d2 = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
                if (!isNaN(d2.getTime())) return d2.toLocaleString('es-CO');
            }
            return String(value);
        }
        return d.toLocaleString('es-CO');
    } catch (e) {
        return String(value || '');
    }
}

async function _cargarConfiguracionDesdeDB() {
    const sb = _ensureSupabase();
    const { data, error } = await sb.from('configuracion').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    if (data) {
        config.ultimoNumeroFactura = data.ultimo_numero_factura ?? config.ultimoNumeroFactura ?? 0;
        config.nombreEmpresa = data.nombre_empresa ?? config.nombreEmpresa ?? '';
        config.direccionEmpresa = data.direccion_empresa ?? config.direccionEmpresa ?? '';
        config.telefonoEmpresa = data.telefono_empresa ?? config.telefonoEmpresa ?? '';

        // Refrescar inputs si existen en el DOM
        const n = document.getElementById('nombreEmpresa');
        const d = document.getElementById('direccionEmpresa');
        const t = document.getElementById('telefonoEmpresa');
        if (n) n.value = config.nombreEmpresa || '';
        if (d) d.value = config.direccionEmpresa || '';
        if (t) t.value = config.telefonoEmpresa || '';
    }
}


function _mapSheetToTable(nombreHoja) {
    const hoja = (nombreHoja || '').toLowerCase().trim();
    const mapa = {
        'inventario': 'inventario',
        'precios': 'precios',
        'ventas': 'ventas',
        'deudores': 'deudores',
        'deudas': 'deudores',
        'historico': 'historico',
        'histórico': 'historico',
        'configuracion': 'configuracion',
        'configuración': 'configuracion',
        'eliminaciones': 'eliminaciones'
    };
    return mapa[hoja] || null;
}

// Crea (si no existe) la fila singleton de configuración
async function _asegurarConfiguracion() {
    const sb = _ensureSupabase();
    const { data, error } = await sb.from('configuracion').select('*').limit(1);
    if (error) throw error;
    if (!data || data.length === 0) {
        const payload = {
            id: 1,
            ultimo_numero_factura: 0,
            nombre_empresa: config.nombreEmpresa,
            direccion_empresa: config.direccionEmpresa,
            telefono_empresa: config.telefonoEmpresa
        };
        const ins = await sb.from('configuracion').insert(payload);
        if (ins.error) throw ins.error;
    }
}

// Función principal: lee una "hoja" (tabla) y la devuelve como matriz (incluye headers)
async function leerHoja(nombreHoja) {
    const sb = _ensureSupabase();
    const table = _mapSheetToTable(nombreHoja);
    if (!table) throw new Error(`Hoja/tabla no soportada: ${nombreHoja}`);

    // Nota: el sistema no carga histórico desde Excel; empezamos desde 0.
    // Estas lecturas son la fuente de verdad.
    let query = sb.from(table).select('*');

    // Orden recomendado por tabla
    if (table === 'inventario' || table === 'precios') query = query.order('tipo', { ascending: true });
    if (table === 'ventas') query = query.order('numero_factura', { ascending: true });
    if (table === 'deudores') query = query.order('fecha', { ascending: false });
    if (table === 'historico') query = query.order('fecha', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    // Convertimos a formato "values" (como Supabase) para no reescribir todo el sistema
    if (table === 'inventario') {
        const header = ['Tipo', 'Stock', 'PrecioCompra', 'ValorTotal', 'UltimaActualizacion'];
        const rows = (data || []).map(r => [
            r.tipo ?? '',
            r.stock ?? 0,
            r.precio_compra ?? 0,
            r.valor_total ?? 0,
            _formatFecha(r.ultima_actualizacion)
        ]);
        return [header, ...rows];
    }

    if (table === 'precios') {
        const header = ['Tipo', 'PrecioCompra', 'Margen', 'PrecioVenta', 'Ganancia'];
        const rows = (data || []).map(r => [
            r.tipo ?? '',
            r.precio_compra ?? 0,
            r.margen ?? 0,
            r.precio_venta ?? 0,
            r.ganancia ?? 0
        ]);
        return [header, ...rows];
    }

    if (table === 'ventas') {
        const header = ['NumeroFactura', 'Fecha', 'Cliente', 'Productos', 'Total', 'DescuentoPorKg', 'DescuentoTotal', 'SubtotalSinDescuento', 'Telefono', 'TipoPago'];
        const rows = (data || []).map(r => [
            r.numero_factura ?? '',
            _formatFecha(r.fecha),
            r.cliente ?? '',
            (_normalizeProductosField(r.productos).join(', ')),
            r.total ?? 0,
            r.descuento_por_kg ?? 0,
            r.descuento_total ?? 0,
            r.subtotal_sin_descuento ?? 0,
            r.telefono ?? '',
            r.tipo_pago ?? 'pagado'
        ]);
        return [header, ...rows];
    }

    if (table === 'deudores') {
        const header = ['NumeroFactura', 'Fecha', 'Cliente', 'Telefono', 'Productos', 'Total', 'Estado', 'FechaPago'];
        const rows = (data || []).map(r => [
            r.numero_factura ?? '',
            _formatFecha(r.fecha),
            r.cliente ?? '',
            r.telefono ?? '',
            (_normalizeProductosField(r.productos).join(', ')),
            r.total ?? 0,
            r.estado ?? 'pendiente',
            _formatFecha(r.fecha_pago)
        ]);
        return [header, ...rows];
    }

    if (table === 'historico') {
        const header = ['Fecha', 'Tipo', 'Cantidad', 'PrecioCompra', 'Proveedor', 'ValorTotal'];
        const rows = (data || []).map(r => [
            _formatFecha(r.fecha),
            r.tipo ?? '',
            r.cantidad ?? 0,
            r.precio_compra ?? 0,
            r.proveedor ?? '',
            r.valor_total ?? 0
        ]);
        return [header, ...rows];
    }

    if (table === 'eliminaciones') {
        const header = ['Fecha', 'NumeroFactura', 'Cliente', 'Productos', 'Total', 'Motivo', 'Usuario'];
        const rows = (data || []).map(r => [
            _formatFecha(r.fecha),
            r.numero_factura ?? '',
            r.cliente ?? '',
            r.productos ?? '',
            r.total ?? 0,
            r.motivo ?? '',
            r.usuario ?? ''
        ]);
        return [header, ...rows];
    }

    if (table === 'configuracion') {
        const header = ['UltimoNumeroFactura', 'NombreEmpresa', 'DireccionEmpresa', 'TelefonoEmpresa'];
        const r = (data && data[0]) || {};
        return [header, [
            r.ultimo_numero_factura ?? 0,
            r.nombre_empresa ?? config.nombreEmpresa,
            r.direccion_empresa ?? config.direccionEmpresa,
            r.telefono_empresa ?? config.telefonoEmpresa
        ]];
    }

    return [];
}

async function escribirHoja(nombreHoja, datos) {
    const sb = _ensureSupabase();
    const table = _mapSheetToTable(nombreHoja);
    if (!table) throw new Error(`Hoja/tabla no soportada: ${nombreHoja}`);

    // Sobrescritura completa (equivalente a "pegar" en Sheets)
    // OJO: se usa solo en escenarios puntuales. Preferimos upserts en funciones específicas.
    const header = (datos || [])[0] || [];
    const rows = (datos || []).slice(1);

    // Borrar todo (equivalente a sobrescribir una hoja completa)
    if (table === 'configuracion') {
        // Configuración es singleton (id=1)
        await _asegurarConfiguracion();
        await _cargarConfiguracionDesdeDB();
    } else if (table === 'inventario' || table === 'precios') {
        // Estas tablas NO tienen columna id (PK = tipo). Usamos un filtro seguro por tipo.
        const del = await sb.from(table).delete().neq('tipo', '__never__');
        if (del.error) throw del.error;
    } else {
        // Tablas con id UUID
        const del = await sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (del.error) throw del.error;
    }

    // Insertar
    const payload = [];
    for (const fila of rows) {
        if (table === 'inventario') {
            payload.push({
                tipo: fila[0],
                stock: parseFloat(fila[1]) || 0,
                precio_compra: parseFloat(fila[2]) || 0,
                valor_total: parseFloat(fila[3]) || 0,
                ultima_actualizacion: _toISO(fila[4])
            });
        } else if (table === 'precios') {
            payload.push({
                tipo: fila[0],
                precio_compra: parseFloat(fila[1]) || 0,
                margen: parseFloat(fila[2]) || 0,
                precio_venta: parseFloat(fila[3]) || 0,
                ganancia: parseFloat(fila[4]) || 0
            });
        } else if (table === 'ventas') {
            payload.push({
                numero_factura: parseInt(fila[0]) || 0,
                fecha: _toISO(fila[1]),
                cliente: fila[2] || '',
                productos: _normalizeProductosField(fila[3]),
                total: parseFloat(fila[4]) || 0,
                descuento_por_kg: parseFloat(fila[5]) || 0,
                descuento_total: parseFloat(fila[6]) || 0,
                subtotal_sin_descuento: parseFloat(fila[7]) || 0,
                telefono: fila[8] || '',
                tipo_pago: fila[9] || 'pagado'
            });
        } else if (table === 'deudores') {
            payload.push({
                numero_factura: parseInt(fila[0]) || 0,
                fecha: _toISO(fila[1]),
                cliente: fila[2] || '',
                telefono: fila[3] || '',
                productos: _normalizeProductosField(fila[4]),
                total: parseFloat(fila[5]) || 0,
                estado: fila[6] || 'pendiente',
                fecha_pago: fila[7] ? _toISO(fila[7]) : null
            });
        } else if (table === 'historico') {
            payload.push({
                fecha: fila[0] ? _toISO(fila[0]) : new Date().toISOString(),
                tipo: fila[1] || '',
                cantidad: parseFloat(fila[2]) || 0,
                precio_compra: parseFloat(fila[3]) || 0,
                proveedor: fila[4] || '',
                valor_total: parseFloat(fila[5]) || 0
            });
        } else if (table === 'eliminaciones') {
            payload.push({
                fecha: fila[0] ? _toISO(fila[0]) : new Date().toISOString(),
                numero_factura: parseInt(fila[1]) || 0,
                cliente: fila[2] || '',
                productos: fila[3] || '',
                total: parseFloat(fila[4]) || 0,
                motivo: fila[5] || '',
                usuario: fila[6] || ''
            });
        } else if (table === 'configuracion') {
            payload.push({
                id: 1,
                ultimo_numero_factura: parseInt(fila[0]) || 0,
                nombre_empresa: fila[1] || config.nombreEmpresa,
                direccion_empresa: fila[2] || config.direccionEmpresa,
                telefono_empresa: fila[3] || config.telefonoEmpresa
            });
        }
    }

    if (payload.length > 0) {
        if (table === 'inventario' || table === 'precios') {
            const ins = await sb.from(table).upsert(payload, { onConflict: 'tipo' });
            if (ins.error) throw ins.error;
        } else if (table === 'configuracion') {
            const up = await sb.from('configuracion').upsert(payload[0], { onConflict: 'id' });
            if (up.error) throw up.error;
        } else {
            const ins = await sb.from(table).insert(payload);
            if (ins.error) throw ins.error;
        }
    }

    return { success: true };
}

async function agregarFilaHoja(nombreHoja, fila) {
    const sb = _ensureSupabase();
    const table = _mapSheetToTable(nombreHoja);
    if (!table) throw new Error(`Hoja/tabla no soportada: ${nombreHoja}`);

    if (table === 'inventario') {
        const payload = {
            tipo: fila[0],
            stock: parseFloat(fila[1]) || 0,
            precio_compra: parseFloat(fila[2]) || 0,
            valor_total: parseFloat(fila[3]) || 0,
            ultima_actualizacion: _toISO(fila[4])
        };
        const up = await sb.from('inventario').upsert(payload, { onConflict: 'tipo' });
        if (up.error) throw up.error;
        return { success: true };
    }

    if (table === 'precios') {
        const payload = {
            tipo: fila[0],
            precio_compra: parseFloat(fila[1]) || 0,
            margen: parseFloat(fila[2]) || 0,
            precio_venta: parseFloat(fila[3]) || 0,
            ganancia: parseFloat(fila[4]) || 0
        };
        const up = await sb.from('precios').upsert(payload, { onConflict: 'tipo' });
        if (up.error) throw up.error;
        return { success: true };
    }

    // Para el resto, insert normal
    const payload = {};
    if (table === 'historico') {
        payload.fecha = fila[0] ? _toISO(fila[0]) : new Date().toISOString();
        payload.tipo = fila[1] || '';
        payload.cantidad = parseFloat(fila[2]) || 0;
        payload.precio_compra = parseFloat(fila[3]) || 0;
        payload.proveedor = fila[4] || '';
        payload.valor_total = parseFloat(fila[5]) || 0;
    } else if (table === 'ventas') {
        payload.numero_factura = parseInt(fila[0]) || 0;
        payload.fecha = _toISO(fila[1]);
        payload.cliente = fila[2] || '';
        payload.productos = _normalizeProductosField(fila[3]);
        payload.total = parseFloat(fila[4]) || 0;
        payload.descuento_por_kg = parseFloat(fila[5]) || 0;
        payload.descuento_total = parseFloat(fila[6]) || 0;
        payload.subtotal_sin_descuento = parseFloat(fila[7]) || 0;
        payload.telefono = fila[8] || '';
        payload.tipo_pago = fila[9] || 'pagado';
    } else if (table === 'deudores') {
        payload.numero_factura = parseInt(fila[0]) || 0;
        payload.fecha = _toISO(fila[1]);
        payload.cliente = fila[2] || '';
        payload.telefono = fila[3] || '';
        // IMPORTANTE: en el sistema los productos suelen venir como texto
        // "Pargo (2 kg), Atún (1 kg)" (no como JSON). Usamos normalizador.
        payload.productos = _normalizeProductosField(fila[4]);
        payload.total = parseFloat(fila[5]) || 0;
        payload.estado = fila[6] || 'pendiente';
        payload.fecha_pago = fila[7] ? _toISO(fila[7]) : null;
    } else if (table === 'eliminaciones') {
        payload.fecha = fila[0] ? _toISO(fila[0]) : new Date().toISOString();
        payload.numero_factura = parseInt(fila[1]) || 0;
        payload.cliente = fila[2] || '';
        payload.productos = fila[3] || '';
        payload.total = parseFloat(fila[4]) || 0;
        payload.motivo = fila[5] || '';
        payload.usuario = fila[6] || '';
    }

    const ins = await sb.from(table).insert(payload);
    if (ins.error) throw ins.error;
    return { success: true };
}

// Helpers
function _safeJsonParse(value, fallback) {
    try {
        if (value === null || value === undefined || value === '') return fallback;
        if (typeof value === 'object') return value;
        return JSON.parse(value);
    } catch (e) {
        return fallback;
    }
}


function _normalizeProductosField(value) {
    // Acepta: array, JSON string, o texto "Pargo (2 kg), Atún (1 kg)"
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (typeof value === 'object') return Object.values(value).map(String);
    const s = String(value).trim();
    if (!s) return [];
    if (s.startsWith('[')) {
        const parsed = _safeJsonParse(s, []);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    }
    // Separador principal: coma
    return s.split(',').map(x => x.trim()).filter(Boolean);
}

// =================== REINTENTOS ===================
// En Supabase no necesitamos . Conservamos las funciones de reintento por estabilidad.
async function escribirHojaConReintento(nombreHoja, datos, intentos = 3) {
    for (let i = 0; i < intentos; i++) {
        try {
            console.log(`📝 Intento ${i + 1}/${intentos} de escribir en ${nombreHoja}...`);
            await escribirHoja(nombreHoja, datos);
            console.log(`✅ Escritura exitosa en ${nombreHoja}`);
            return;
        } catch (error) {
            console.error(`❌ Error en intento ${i + 1}:`, error.message || error);
            if (i === intentos - 1) throw error;
            const tiempoEspera = (i + 1) * 1500;
            await new Promise(resolve => setTimeout(resolve, tiempoEspera));
        }
    }
}

async function agregarFilaConReintento(nombreHoja, fila, intentos = 3) {
    for (let i = 0; i < intentos; i++) {
        try {
            console.log(`Intento ${i + 1}/${intentos} de agregar fila en ${nombreHoja}...`);
            await agregarFilaHoja(nombreHoja, fila);
            console.log(`Fila agregada exitosamente en ${nombreHoja}`);
            return;
        } catch (error) {
            console.error(`Error en intento ${i + 1}:`, error.message || error);
            if (i === intentos - 1) return;
            const tiempoEspera = (i + 1) * 1500;
            await new Promise(resolve => setTimeout(resolve, tiempoEspera));
        }
    }
}

// =================== FUNCIONES PRINCIPALES ===================

        // REEMPLAZA tu función // TAMBIÉN agrega esta función para probar la URL directamente
        // Probar conexión con Supabase
window.probarConexion = async function() {
    console.log('🔌 Iniciando prueba de conexión (Supabase)...');

    updateConnectionStatus('loading', 'Probando conexión con Supabase...');

    try {
        // Credenciales ya están embebidas en el código (SUPABASE_URL / SUPABASE_ANON_KEY)
        _ensureSupabase();

        // Validar que existan tablas/config mínima
        await _asegurarConfiguracion();
        await _cargarConfiguracionDesdeDB();

        isConfigured = true;

        updateConnectionStatus('connected', 'Conectado a Supabase');
        mostrarAlerta('Conexión exitosa con Supabase', 'success');

        // Cargar todo al conectar
        await cargarTodosLosDatos();
    } catch (error) {
        console.error('❌ Error de conexión Supabase:', error);
        isConfigured = false;
        updateConnectionStatus('disconnected', '❌ Error de conexión a Supabase');
        mostrarAlerta('❌ Error conectando a Supabase: ' + (error.message || error), 'danger');
    }
};

// Guardar configuración de Supabase
window.guardarConfiguracion = async function() {
    // Ya no se guardan credenciales en pantalla/localStorage.
    // Dejamos esta función por compatibilidad (si algún botón viejo la llama).
    return window.probarConexion();
};

window.guardarDatosEmpresa = async function() {
    try {
        _ensureSupabase();

        config.nombreEmpresa = (document.getElementById('nombreEmpresa')?.value || '').trim();
        config.direccionEmpresa = (document.getElementById('direccionEmpresa')?.value || '').trim();
        config.telefonoEmpresa = (document.getElementById('telefonoEmpresa')?.value || '').trim();

        // También guardamos en localStorage para que cargue rápido (fallback)
        localStorage.setItem('nombreEmpresa', config.nombreEmpresa);
        localStorage.setItem('direccionEmpresa', config.direccionEmpresa);
        localStorage.setItem('telefonoEmpresa', config.telefonoEmpresa);

        // Persistir en Supabase (tabla configuracion, singleton id=1)
        const sb = _ensureSupabase();
        const payload = {
            id: 1,
            nombre_empresa: config.nombreEmpresa,
            direccion_empresa: config.direccionEmpresa,
            telefono_empresa: config.telefonoEmpresa
        };
        const { error } = await sb.from('configuracion').upsert(payload, { onConflict: 'id' });
        if (error) throw error;

        mostrarAlerta('Datos de la pesquera guardados en la base de datos', 'success');
    } catch (error) {
        console.error('❌ Error guardando datos de la pesquera:', error);
        mostrarAlerta('❌ No se pudieron guardar los datos de la pesquera: ' + (error.message || error), 'danger');
    }
};

        // =================== FUNCIONES DE DATOS ===================

        // Cargar todos los datos
        async function cargarTodosLosDatos() {
            // Validar Supabase
            _ensureSupabase();

            // Asegurar y cargar configuración desde DB
            await _asegurarConfiguracion();
            await _cargarConfiguracionDesdeDB();

try {
                updateConnectionStatus('loading', 'Cargando datos...');

                console.log('Cargando inventario...');
                await cargarInventario();

                console.log('Cargando precios...');
                await cargarPrecios();

                updateConnectionStatus('connected', 'Datos cargados correctamente');
                isConfigured = true;

                console.log('Todos los datos cargados exitosamente');

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
                                precioCompra: parseFloat(fila[2]) || 0,
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
            const cantidadInput = document.getElementById('kilosRecibidos') || document.getElementById('librasRecibidas');
            const kilos = parseFloat((cantidadInput && cantidadInput.value) || '');
            const precio = parseFloat(document.getElementById('precioCompra').value);
            // Soportar distintos IDs por compatibilidad
            const proveedorEl = document.getElementById('proveedorInventario') || document.getElementById('proveedor');
            const proveedor = (proveedorEl && proveedorEl.value ? proveedorEl.value : '').trim();

            if (!tipo || !kilos || !precio) {
                mostrarAlerta('Complete todos los campos obligatorios', 'warning');
                return;
            }

            const btnAgregar = document.getElementById('btnAgregarInventario');
            btnAgregar.disabled = true;
            btnAgregar.innerHTML = '<span class="loading"></span> AGREGANDO...';

            try {
                // Calcular nuevo inventario
                if (!inventarioData[tipo]) {
                    inventarioData[tipo] = { stock: 0, precioCompra: 0, valorTotal: 0 };
                }

                const valorAnterior = inventarioData[tipo].valorTotal;

                inventarioData[tipo].stock += kilos;
                // Precio de compra NO es promedio: guardamos el último precio pagado al recibir
                inventarioData[tipo].precioCompra = precio;
                inventarioData[tipo].valorTotal = valorAnterior + (kilos * precio);
                inventarioData[tipo].ultimaActualizacion = new Date().toLocaleDateString();

                // Preparar datos para escribir en Inventario
                const datosInventario = [
                    ['Tipo', 'Stock', 'PrecioCompra', 'ValorTotal', 'UltimaActualizacion'],
                    ...Object.entries(inventarioData).map(([tipoPez, datos]) => [
                        tipoPez,
                        datos.stock,
                        datos.precioCompra,
                        datos.valorTotal,
                        datos.ultimaActualizacion
                    ])
                ];

                await escribirHoja('Inventario', datosInventario);

                // =================== REGISTRAR EN HISTÓRICO ===================
                const fechaActual = new Date().toLocaleDateString();
                const valorTotal = kilos * precio;
                const proveedorFinal = proveedor || 'No especificado';

                // Leer histórico actual
                let datosHistorico = [];
                try {
                    datosHistorico = await leerHoja('Historico');
                    if (datosHistorico.length === 0) {
                        // Si está vacío, crear con encabezados
                        datosHistorico = [['Fecha', 'Tipo', 'CantidadKg', 'PrecioCompra', 'Proveedor', 'ValorTotal']];
                    }
                } catch (error) {
                    console.log('Creando nueva hoja de histórico');
                    datosHistorico = [['Fecha', 'Tipo', 'CantidadKg', 'PrecioCompra', 'Proveedor', 'ValorTotal']];
                }

                // Agregar nueva entrada al histórico
                datosHistorico.push([new Date().toISOString(), tipo, kilos, precio, proveedorFinal, valorTotal]);

                // Escribir histórico actualizado
                await escribirHoja('Historico', datosHistorico);
                console.log('✅ Entrada registrada en histórico');
                // =================== FIN REGISTRO HISTÓRICO ===================

                // Limpiar formulario
                document.getElementById('tipoPescadoInventario').value = '';
                if (document.getElementById('kilosRecibidos')) document.getElementById('kilosRecibidos').value = '';
                if (document.getElementById('librasRecibidas')) document.getElementById('librasRecibidas').value = '';
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
                    <td>${formatearPesos(datos.precioCompra)}</td>
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
                precioCompraInput.value = Math.round(inventarioData[tipo].precioCompra);
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
                    select.innerHTML += `<option value="${tipo}">${tipo} (${inventarioData[tipo].stock.toFixed(1)} kg disponibles)</option>`;
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
            
            // Obtener datos de descuento individual
            const tipoDescuentoInd = document.getElementById('tipoDescuentoIndividual').value;
            const descuentoInd = parseFloat(document.getElementById('descuentoIndividual').value) || 0;

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

            const subtotalSinDescuento = cantidad * precio;
            let descuentoProducto = 0;
            let tipoDescuento = 'ninguno';
            let valorDescuento = 0;

            // Calcular descuento individual
            // Nota: cuando el tipo es 'dinero', el valor se interpreta como DESCUENTO POR KG.
            // Ej: si pones 10.000 y llevas 2.5 kg => descuento total del producto = 25.000.
            if (tipoDescuentoInd === 'porcentaje' && descuentoInd > 0) {
                descuentoProducto = (subtotalSinDescuento * descuentoInd) / 100;
                tipoDescuento = 'porcentaje';
                valorDescuento = descuentoInd;
            } else if (tipoDescuentoInd === 'dinero' && descuentoInd > 0) {
                const descuentoPorKg = descuentoInd;
                descuentoProducto = descuentoPorKg * cantidad;
                tipoDescuento = 'dinero';
                valorDescuento = descuentoPorKg; // guardamos $/kg
            }

            // Evitar que el descuento deje el subtotal en negativo
            if (descuentoProducto > subtotalSinDescuento) descuentoProducto = subtotalSinDescuento;

            const subtotal = subtotalSinDescuento - descuentoProducto;

            ventaActual.push({
                tipo: tipo,
                cantidad: cantidad,
                precio: precio,
                subtotalSinDescuento: subtotalSinDescuento,
                descuentoProducto: descuentoProducto,
                tipoDescuento: tipoDescuento,
                valorDescuento: valorDescuento,
                subtotal: subtotal
            });

            // Limpiar campos
            document.getElementById('tipoPescadoVenta').value = '';
            document.getElementById('cantidadVenta').value = '';
            document.getElementById('precioVentaProducto').value = '';
            document.getElementById('conversionKilos').textContent = '';
            document.getElementById('tipoDescuentoIndividual').value = 'ninguno';
            document.getElementById('descuentoIndividual').value = '0';
            toggleDescuentoIndividual();

            actualizarTablaVentaActual();
        };

        // Actualizar tabla de venta actual
        function actualizarTablaVentaActual() {
            const tbody = document.querySelector('#tablaVentaActual tbody');
            tbody.innerHTML = '';

            let subtotalGeneral = 0;

            ventaActual.forEach((producto, index) => {
                let descuentoTexto = 'Sin descuento';
                
                if (producto.tipoDescuento === 'porcentaje') {
                    descuentoTexto = `${producto.valorDescuento}% (-${formatearPesos(producto.descuentoProducto)})`;
                } else if (producto.tipoDescuento === 'dinero') {
                    // En 'dinero', valorDescuento es $/kg y descuentoProducto es el total descontado del item
                    descuentoTexto = `${formatearPesos(producto.valorDescuento)}/kg (-${formatearPesos(producto.descuentoProducto)})`;
                }

                const fila = tbody.insertRow();
                fila.innerHTML = `
                    <td>${producto.tipo}</td>
                    <td>${producto.cantidad.toFixed(3)}</td>
                    <td>${formatearPesos(producto.precio)}</td>
                    <td style="color: ${producto.descuentoProducto > 0 ? '#f44336' : '#666'};">${descuentoTexto}</td>
                    <td><strong>${formatearPesos(producto.subtotal)}</strong></td>
                    <td><button class="btn btn-danger" onclick="eliminarProductoVenta(${index})">Eliminar</button></td>
                `;
                subtotalGeneral += producto.subtotal;
            });

            // Mostrar subtotal
            document.getElementById('subtotalVenta').textContent = formatearNumero(subtotalGeneral);

            // Calcular descuento global
            const tipoDescuentoGlobal = document.getElementById('tipoDescuentoGlobal').value;
            const descuentoGlobal = parseFloat(document.getElementById('descuentoGlobal').value) || 0;
            let montoDescuentoGlobal = 0;

            if (tipoDescuentoGlobal === 'porcentaje' && descuentoGlobal > 0) {
                montoDescuentoGlobal = (subtotalGeneral * descuentoGlobal) / 100;
            } else if (tipoDescuentoGlobal === 'dinero' && descuentoGlobal > 0) {
                montoDescuentoGlobal = descuentoGlobal;
            }

            // Mostrar/ocultar el descuento global
            const descuentoGlobalDisplay = document.getElementById('descuentoGlobalDisplay');
            if (montoDescuentoGlobal > 0) {
                descuentoGlobalDisplay.style.display = 'block';
                document.getElementById('montoDescuentoGlobal').textContent = formatearNumero(montoDescuentoGlobal);
            } else {
                descuentoGlobalDisplay.style.display = 'none';
            }

            const totalFinal = subtotalGeneral - montoDescuentoGlobal;
            document.getElementById('totalVenta').textContent = formatearNumero(Math.max(0, totalFinal));
            
            // Recalcular cambio si hay efectivo ingresado
            calcularCambio();
        }

        // Calcular cambio para la venta
        window.calcularCambio = function() {
            const subtotal = ventaActual.reduce((sum, producto) => sum + producto.subtotal, 0);
            
            // Aplicar descuento global
            const tipoDescuentoGlobal = document.getElementById('tipoDescuentoGlobal').value;
            const descuentoGlobal = parseFloat(document.getElementById('descuentoGlobal').value) || 0;
            let montoDescuentoGlobal = 0;

            if (tipoDescuentoGlobal === 'porcentaje' && descuentoGlobal > 0) {
                montoDescuentoGlobal = (subtotal * descuentoGlobal) / 100;
            } else if (tipoDescuentoGlobal === 'dinero' && descuentoGlobal > 0) {
                montoDescuentoGlobal = descuentoGlobal;
            }

            const totalVenta = subtotal - montoDescuentoGlobal;
            
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

        // Toggle para mostrar/ocultar campo de descuento individual
        window.toggleDescuentoIndividual = function() {
            const tipo = document.getElementById('tipoDescuentoIndividual').value;
            const grupo = document.getElementById('grupoDescuentoIndividual');
            const label = document.getElementById('labelDescuentoIndividual');
            const input = document.getElementById('descuentoIndividual');
            
            if (tipo === 'ninguno') {
                grupo.style.display = 'none';
                input.value = '0';
            } else {
                grupo.style.display = 'block';
                if (tipo === 'porcentaje') {
                    label.textContent = 'Descuento (%):';
                    input.placeholder = 'Ej: 10';
                    input.max = '100';
                } else if (tipo === 'dinero') {
                    label.textContent = 'Descuento (COP por kg):';
                    input.placeholder = 'Ej: 5000 (por kg)';
                    input.max = '';
                }
            }
        };

        // Toggle para mostrar/ocultar campo de descuento global
        window.toggleDescuentoGlobal = function() {
            const tipo = document.getElementById('tipoDescuentoGlobal').value;
            const grupo = document.getElementById('grupoDescuentoGlobal');
            const label = document.getElementById('labelDescuentoGlobal');
            const input = document.getElementById('descuentoGlobal');
            
            if (tipo === 'ninguno') {
                grupo.style.display = 'none';
                input.value = '0';
            } else {
                grupo.style.display = 'block';
                if (tipo === 'porcentaje') {
                    label.textContent = 'Descuento (%):';
                    input.placeholder = 'Ej: 5';
                    input.max = '100';
                } else if (tipo === 'dinero') {
                    label.textContent = 'Descuento (COP por kg):';
                    input.placeholder = 'Ej: 10000';
                    input.max = '';
                }
            }
            
            actualizarTablaVentaActual();
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
            const tipoPago = document.getElementById('tipoPago').value;

            // Obtener información de descuento global
            const tipoDescuentoGlobal = document.getElementById('tipoDescuentoGlobal').value;
            const valorDescuentoGlobal = parseFloat(document.getElementById('descuentoGlobal').value) || 0;

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

                // =================== DESCUENTOS (INDIVIDUAL + GLOBAL) ===================
                // Subtotal base (antes de cualquier descuento)
                const subtotalSinDescuento = ventaActual.reduce((sum, p) => sum + (Number(p.subtotalSinDescuento) || 0), 0);

                // Descuento individual total (suma de descuentos por producto)
                const descuentoIndividualTotal = ventaActual.reduce((sum, p) => sum + (Number(p.descuentoProducto) || 0), 0);

                // Subtotal luego de descuentos individuales (esto es lo que ves como "subtotal" por producto)
                const subtotalProductos = ventaActual.reduce((sum, p) => sum + (Number(p.subtotal) || 0), 0);

                // Calcular descuento global (se aplica SOBRE el subtotal ya con descuentos individuales)
                let montoDescuentoGlobal = 0;
                if (tipoDescuentoGlobal === 'porcentaje' && valorDescuentoGlobal > 0) {
                    montoDescuentoGlobal = (subtotalProductos * valorDescuentoGlobal) / 100;
                } else if (tipoDescuentoGlobal === 'dinero' && valorDescuentoGlobal > 0) {
                    montoDescuentoGlobal = valorDescuentoGlobal;
                }

                // Descuento total real (individual + global)
                const descuentoTotal = descuentoIndividualTotal + montoDescuentoGlobal;

                // Total a pagar (subtotal base - descuento total)
                const total = subtotalSinDescuento - descuentoTotal;

                // Obtener número de factura
                const numeroFactura = await obtenerSiguienteNumeroFactura();

                // Actualizar inventario
                ventaActual.forEach(producto => {
                    inventarioData[producto.tipo].stock -= producto.cantidad;
                    inventarioData[producto.tipo].valorTotal = inventarioData[producto.tipo].stock * inventarioData[producto.tipo].precioCompra;
                });

                // Guardar venta con nueva estructura de descuentos
                const venta = {
                    numero: numeroFactura,
                    fecha: new Date().toLocaleDateString(),
                    cliente: cliente,
                    telefono: telefono,
                    productosArray: ventaActual.map(p => `${p.tipo} (${p.cantidad.toFixed(3)} kg)`),
                    productos: ventaActual.map(p => `${p.tipo} (${p.cantidad.toFixed(3)} kg)`).join(', '),
                    productosDetalle: ventaActual, // Guardamos el detalle completo de productos con descuentos
                    total: total,
                    subtotalProductos: subtotalProductos,
                    tipoDescuentoGlobal: tipoDescuentoGlobal,
                    valorDescuentoGlobal: valorDescuentoGlobal,
                    montoDescuentoGlobal: montoDescuentoGlobal,
                    // =================== CAMPOS PARA REPORTES / REIMPRESIÓN ===================
                    // Guardamos también los campos legacy (por kg / total / subtotal) para que
                    // la factura en "Reportes" muestre descuentos igual que en la venta.
                    // - descuentoTotal: monto real descontado
                    // - subtotalSinDescuento: subtotal antes del descuento
                    // - descuentoPorKg: valor aproximado por kg (para compatibilidad con formato viejo)
                    // OJO: estos campos son los que usa "Reportes" y la reimpresión
                    // Deben representar el descuento REAL aplicado (individual + global)
                    descuentoTotal: descuentoTotal,
                    subtotalSinDescuento: subtotalSinDescuento,
                    descuentoPorKg: (ventaActual.reduce((sum, p) => sum + p.cantidad, 0) > 0)
                        ? (descuentoTotal / ventaActual.reduce((sum, p) => sum + p.cantidad, 0))
                        : 0,
                    totalKilos: ventaActual.reduce((sum, p) => sum + p.cantidad, 0),
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
                generarHTMLFactura(venta, ventaActual, cliente, telefono);

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
                // Guardar productos como array en Supabase (pero soportar texto también)
                Array.isArray(venta.productosArray) ? JSON.stringify(venta.productosArray) : (venta.productos || ''),
                venta.total,
                // En el sistema es por KG (no por libra)
                venta.descuentoPorKg || venta.descuentoPorLibra || 0,
                venta.descuentoTotal || 0,
                venta.subtotalSinDescuento || venta.total,
                venta.telefono || '',
                venta.tipoPago || 'pagado'
            ];

            await agregarFilaHoja('Ventas', filaNuevaVenta);
        }

        // Actualizar inventario en sheets
        async function actualizarInventarioEnSheets() {
            const datosInventario = [
                ['Tipo', 'Stock', 'PrecioCompra', 'ValorTotal', 'UltimaActualizacion'],
                ...Object.entries(inventarioData).map(([tipoPez, datos]) => [
                    tipoPez,
                    datos.stock,
                    datos.precioCompra,
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
                                <button class="btn btn-success" onclick="pagarDeuda(${numeroFactura})" 
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
        window.pagarDeuda = async function(numeroFactura) {
            if (!confirm('¿Confirmar el pago de esta deuda?')) return;

            try {
                const sb = _ensureSupabase();
                const num = parseInt(numeroFactura) || 0;
                if (!num) throw new Error('Número de factura inválido');

                // Guardar timestamp real (fecha + hora)
                const fechaPagoISO = new Date().toISOString();

                // Actualizar SOLO la fila correspondiente (no reinsertar todo)
                const { error } = await sb
                    .from('deudores')
                    .update({ estado: 'pagado', fecha_pago: fechaPagoISO })
                    .eq('numero_factura', num)
                    .eq('estado', 'pendiente');

                if (error) throw error;

                mostrarAlerta('✅ Deuda marcada como pagada', 'success');
                await cargarDeudores();
            } catch (error) {
                console.error('❌ Error pagando deuda:', error);
                mostrarAlerta(`Error al marcar deuda como pagada: ${error.message || error}`, 'danger');
            }
        };

        // Generar HTML de factura
        function generarHTMLFactura(venta, productos, cliente, telefono) {
            const facturaHTML = `
                <div class="factura">
                    <div style="text-align: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px dashed #000;">
                        <h2 style="margin: 5px 0; font-size: 1.3em;">${config.nombreEmpresa}</h2>
                        <p style="margin: 2px 0; font-size: 0.85em;">${config.direccionEmpresa}</p>
                        <p style="margin: 2px 0; font-size: 0.85em;">Tel: ${config.telefonoEmpresa}</p>
                    </div>
                    
                    <div style="text-align: center; margin: 10px 0; padding: 8px 0; border-bottom: 1px dashed #000;">
                        <p style="margin: 2px 0; font-size: 1em;"><strong>FACTURA #${venta.numero.toString().padStart(6, '0')}</strong></p>
                        <p style="margin: 2px 0; font-size: 0.8em;">Fecha: ${venta.fecha}</p>
                        <p style="margin: 2px 0; font-size: 0.8em;">Hora: ${new Date().toLocaleTimeString()}</p>
                    </div>
                    
                    <div style="margin: 10px 0; padding: 5px 0; border-bottom: 1px dashed #000;">
                        <p style="margin: 2px 0; font-size: 0.85em;"><strong>CLIENTE:</strong></p>
                        <p style="margin: 2px 0; font-size: 0.8em;">${cliente}</p>
                        ${telefono && telefono !== 'N/A' ? `<p style="margin: 2px 0; font-size: 0.8em;">Tel: ${telefono}</p>` : ''}
                    </div>
                    
                    <div style="margin: 10px 0; padding-bottom: 10px; border-bottom: 1px dashed #000;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-weight: bold; font-size: 0.85em; border-bottom: 2px solid #000; padding-bottom: 3px;">
                            <div style="width: 45%;">PRODUCTO</div>
                            <div style="width: 25%; text-align: center;">CANT</div>
                            <div style="width: 30%; text-align: right;">TOTAL</div>
                        </div>
                        
                        ${productos.map(producto => {
                            let html = `
                            <div style="margin: 8px 0;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.85em;">
                                    <div style="width: 45%; font-weight: bold;">${producto.tipo}</div>
                                    <div style="width: 25%; text-align: center;">${producto.cantidad.toFixed(3)} kg</div>
                                    <div style="width: 30%; text-align: right; font-weight: bold;">${formatearPesos(producto.subtotal)}</div>
                                </div>
                                <div style="font-size: 0.75em; color: #666; margin-top: 2px; padding-left: 5px;">
                                    @ ${formatearPesos(producto.precio)}/kg
                                </div>`;
                            
                            // Agregar descuento individual si existe
                            if (producto.descuentoProducto > 0) {
                                if (producto.tipoDescuento === 'porcentaje') {
                                    html += `<div style="font-size: 0.75em; color: #d32f2f; margin-top: 2px; padding-left: 5px;">Descuento ${producto.valorDescuento}%: -${formatearPesos(producto.descuentoProducto)}</div>`;
                                } else {
                                    html += `<div style="font-size: 0.75em; color: #d32f2f; margin-top: 2px; padding-left: 5px;">Descuento: -${formatearPesos(producto.descuentoProducto)}</div>`;
                                }
                            }
                            
                            html += `</div>`;
                            return html;
                        }).join('')}
                    </div>
                    
                    <div style="text-align: right; padding: 10px 0;">
                        ${venta.montoDescuentoGlobal > 0 ? `
                            <div style="font-size: 0.9em; margin: 5px 0;">
                                <span>Subtotal:</span> <strong>${formatearPesos(venta.subtotalProductos)}</strong>
                            </div>
                            <div style="font-size: 0.9em; margin: 5px 0; color: #d32f2f;">
                                <span>Descuento ${venta.tipoDescuentoGlobal === 'porcentaje' ? venta.valorDescuentoGlobal + '%' : 'Global'}:</span> <strong>-${formatearPesos(venta.montoDescuentoGlobal)}</strong>
                            </div>
                            <div style="border-top: 2px solid #000; margin: 8px 0; padding-top: 8px;">
                        ` : '<div style="border-top: 2px solid #000; padding-top: 8px;">'}
                            <div style="font-size: 1.3em; font-weight: bold;">
                                TOTAL A PAGAR: ${formatearPesos(venta.total)}
                            </div>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px dashed #000;">
                        <p style="margin: 5px 0; font-size: 0.8em;">¡Gracias por su compra!</p>
                        <p style="margin: 5px 0; font-size: 0.75em;">Pescado fresco del día</p>
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
            document.getElementById('tipoDescuentoIndividual').value = 'ninguno';
            document.getElementById('descuentoIndividual').value = '0';
            document.getElementById('tipoDescuentoGlobal').value = 'ninguno';
            document.getElementById('descuentoGlobal').value = '0';
            toggleDescuentoIndividual();
            toggleDescuentoGlobal();
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
// Normalizar fecha para reportes (soporta 'dd/m/yyyy' y 'dd/m/yyyy, hh:mm:ss a. m./p. m.')
const _fechaSolo = String(fechaVenta).split(',')[0].trim();
const _parts = _fechaSolo.split('/');
const _fechaObj = (_parts.length === 3) ? new Date(`${_parts[2]}-${String(_parts[1]).padStart(2,'0')}-${String(_parts[0]).padStart(2,'0')}T00:00:00`) : new Date(_fechaSolo);
const _fechaKey = (!isNaN(_fechaObj.getTime())) ? _fechaObj.toLocaleDateString() : _fechaSolo;
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
                            const productos = _normalizeProductosField(productosTexto);
                            for (const productoStr of productos) {
                                const producto = parsearProducto(productoStr);
                                if (producto) {
                                    productosSet.add(producto.tipo);
                                }
                            }

                            // Ventas de hoy
                            if (_fechaKey === hoy) {
                                totalHoy += totalVenta;
                            }

                            // Sumar TODAS las ventas al total histórico
                            totalHistorico += totalVenta;

                            // Calcular ganancias para TODAS las ventas (totales)
                            let gananciaVentaTotal = 0;
                            const productosVenta = _normalizeProductosField(productosTexto);
                            for (const productoStr of productosVenta) {
                                const producto = parsearProducto(productoStr);
                                if (producto && preciosData[producto.tipo]) {
                                    const gananciaPorKilo = preciosData[producto.tipo].ganancia || 0;

                                    if (producto.unidad === 'lbs') {
                                        // Datos antiguos en libras: dividir entre 2.20462 para pasar ganancia a libra
                                        const gananciaPorLibra = gananciaPorKilo / KILOS_A_LIBRAS;
                                        gananciaVentaTotal += (producto.cantidad * gananciaPorLibra);
                                    } else {
                                        // Datos nuevos en kilos: usar la ganancia por kilo tal cual
                                        gananciaVentaTotal += (producto.cantidad * gananciaPorKilo);
                                    }
                                }
                            }
                            // Los descuentos reducen el ingreso, por tanto reducen la ganancia
                            gananciaVentaTotal -= (descuentoTotal || 0);
                            gananciasTotal += gananciaVentaTotal;

                            // Ventas del mes y ganancias del mes
                            try {
                                // Normalizar fecha para comparación (soporta 'dd/m/yyyy' y 'dd/m/yyyy, hh:mm:ss a. m./p. m.')
                                const fechaSolo = String(fechaVenta).split(',')[0].trim();
                                const parts = fechaSolo.split('/');
                                const fecha = (parts.length === 3) ? new Date(`${parts[2]}-${String(parts[1]).padStart(2,'0')}-${String(parts[0]).padStart(2,'0')}T00:00:00`) : new Date(fechaSolo);
                                
                                if (!isNaN(fecha.getTime()) && fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual) {
                                    totalMes += totalVenta;

                                    // Calcular ganancias del mes (incluye descuentos)
                                    let gananciaVentaMes = 0;
                                    const productosMes = productosTexto.split(', ');
                                    for (const productoStr of productosMes) {
                                        const producto = parsearProducto(productoStr);
                                        if (producto && preciosData[producto.tipo]) {
                                            const gananciaPorKilo = preciosData[producto.tipo].ganancia || 0;

                                            if (producto.unidad === 'lbs') {
                                                // Datos antiguos en libras: dividir entre 2.20462 para pasar ganancia a libra
                                                const gananciaPorLibra = gananciaPorKilo / KILOS_A_LIBRAS;
                                                gananciaVentaMes += (producto.cantidad * gananciaPorLibra);
                                            } else {
                                                // Datos nuevos en kilos: usar la ganancia por kilo tal cual
                                                gananciaVentaMes += (producto.cantidad * gananciaPorKilo);
                                            }
                                        }
                                    }
                                    gananciaVentaMes -= (descuentoTotal || 0);
                                    gananciasMes += gananciaVentaMes;
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
                    // No hay ventas aún: igual debemos mostrar el valor del inventario.
                    ventasCompletasData = [];
                    poblarFiltrosReportes(new Set(), new Set());

                    let totalInventario = 0;
                    for (const tipo in inventarioData) {
                        totalInventario += inventarioData[tipo].valorTotal;
                    }

                    document.getElementById('totalVentasHoy').textContent = '$0.00';
                    document.getElementById('totalVentasMes').textContent = '$0.00';
                    document.getElementById('totalVentasHistorico').textContent = '$0.00';
                    document.getElementById('gananciasMes').textContent = '$0.00';
                    document.getElementById('gananciasTotal').textContent = '$0.00';
                    document.getElementById('totalInventario').textContent = formatearPesos(totalInventario);
                    // document.getElementById('numeroFacturas').textContent = '0'; // Removido del diseño

                    // Tablas en estado vacío
                    actualizarTablaUltimasVentas([]);
                    actualizarTablaStockBajo();

                    updateConnectionStatus('connected', 'Reportes listos (sin ventas registradas)');
                    mostrarAlerta('Aún no hay ventas registradas. Mostrando el valor del inventario.', 'info');
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
                            onclick="regenerarFactura('${venta.numero}', '${venta.fecha}', '${venta.cliente.replace(/'/g, "\\'")}', \`${venta.productos}\`, ${venta.total}, ${(venta.descuentoPorKg || venta.descuentoPorLibra) || 0}, ${venta.descuentoTotal || 0}, ${venta.subtotalSinDescuento || venta.total})"
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
                                fecha: fila[0] || '',
                                tipo: fila[1] || '',
                                cantidad: parseFloat(fila[2]) || 0,
                                precioCompra: parseFloat(fila[3]) || 0,
                                proveedor: (fila[4] && String(fila[4]).trim()) ? fila[4] : 'No especificado',
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
                    document.getElementById('totalKilosHistorico').textContent = '0 kg';
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
                    const fecha = new Date(d.fecha);
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
                        const fecha = new Date(d.fecha);
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
                    const fechaA = new Date(a.fecha);
                    const fechaB = new Date(b.fecha);
                    return fechaB - fechaA;
                } catch (e) {
                    return 0;
                }
            });

            datos.forEach(entrada => {
                const fila = tbody.insertRow();
                fila.innerHTML = `
                    <td>${_formatFecha(entrada.fecha)}</td>
                    <td><strong>${entrada.tipo}</strong></td>
                    <td style="text-align: center;">${entrada.cantidad.toFixed(2)} kg</td>
                    <td style="text-align: right;">${formatearPesos(entrada.precioCompra)}</td>
                    <td>${entrada.proveedor}</td>
                    <td style="text-align: right;"><strong>${formatearPesos(entrada.valorTotal)}</strong></td>
                `;
            });
        }

        // Actualizar estadísticas del histórico
        function actualizarEstadisticasHistorico(datos) {
            const totalEntradas = datos.length;
            const totalKilos = datos.reduce((sum, d) => sum + d.cantidad, 0);
            const totalInversion = datos.reduce((sum, d) => sum + d.valorTotal, 0);

            document.getElementById('totalEntradasHistorico').textContent = totalEntradas;
            document.getElementById('totalKilosHistorico').textContent = totalKilos.toFixed(2) + ' kg';
            document.getElementById('totalInversionHistorico').textContent = formatearPesos(totalInversion);
        }

        // =================== INICIALIZACIÓN ===================

        // Cargar configuración guardada al iniciar
        

// =================== GASTOS ===================

// Asegura valores por defecto de fechas (mes actual)
function prepararGastosUI() {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');

    const gastoFecha = document.getElementById('gastoFecha');
    if (gastoFecha && !gastoFecha.value) {
        gastoFecha.value = `${yyyy}-${mm}-${dd}`;
    }

    const desde = document.getElementById('gastosDesde');
    const hasta = document.getElementById('gastosHasta');

    // Primer día del mes
    const firstDay = `${yyyy}-${mm}-01`;

    if (desde && !desde.value) desde.value = firstDay;
    if (hasta && !hasta.value) hasta.value = `${yyyy}-${mm}-${dd}`;
}

// Convierte YYYY-MM-DD a ISO inicio/fin del día (para filtrar en Supabase)
function _dateToISOStart(dateStr) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
}
function _dateToISOEnd(dateStr) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T23:59:59.999`);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
}

window.agregarGasto = async function() {
    if (!isConfigured) {
        mostrarAlerta('Configure el sistema primero', 'warning');
        return;
    }

    const concepto = (document.getElementById('gastoConcepto')?.value || '').trim();
    const valor = parseFloat(document.getElementById('gastoValor')?.value || '');
    const fechaStr = document.getElementById('gastoFecha')?.value || '';

    if (!concepto || !valor || valor <= 0) {
        mostrarAlerta('Complete concepto y valor del gasto', 'warning');
        return;
    }

    const btn = document.getElementById('btnAgregarGasto');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span> REGISTRANDO...';
    }

    try {
        const sb = _ensureSupabase();

        const payload = {
            concepto,
            valor,
            // si no hay fecha, usamos now()
            fecha: fechaStr ? _dateToISOStart(fechaStr) : new Date().toISOString()
        };

        const { error } = await sb.from('gastos').insert(payload);
        if (error) throw error;

        // Limpiar inputs
        const c = document.getElementById('gastoConcepto');
        const v = document.getElementById('gastoValor');
        if (c) c.value = '';
        if (v) v.value = '';

        mostrarAlerta('✅ Gasto registrado', 'success');
        await cargarGastos();
    } catch (error) {
        console.error('❌ Error registrando gasto:', error);
        mostrarAlerta('❌ No se pudo registrar el gasto: ' + (error.message || error), 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'REGISTRAR';
        }
    }
};

window.filtrarGastos = function() {
    if (!isConfigured) {
        mostrarAlerta('Configure el sistema primero', 'warning');
        return;
    }
    cargarGastos();
};

window.limpiarFiltroGastos = function() {
    const desde = document.getElementById('gastosDesde');
    const hasta = document.getElementById('gastosHasta');
    if (desde) desde.value = '';
    if (hasta) hasta.value = '';
    prepararGastosUI();
    cargarGastos();
};

window.cargarGastos = async function() {
    try {
        const sb = _ensureSupabase();

        const desdeStr = document.getElementById('gastosDesde')?.value || '';
        const hastaStr = document.getElementById('gastosHasta')?.value || '';

        let query = sb.from('gastos').select('*');

        const desdeISO = _dateToISOStart(desdeStr);
        const hastaISO = _dateToISOEnd(hastaStr);

        if (desdeISO) query = query.gte('fecha', desdeISO);
        if (hastaISO) query = query.lte('fecha', hastaISO);

        query = query.order('fecha', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        gastosData = data || [];
        actualizarTablaGastos();
    } catch (error) {
        console.error('❌ Error cargando gastos:', error);
        mostrarAlerta('❌ Error cargando gastos: ' + (error.message || error), 'danger');
    }
};

function actualizarTablaGastos() {
    const tbody = document.querySelector('#tablaGastos tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    let total = 0;

    for (const g of (gastosData || [])) {
        const fecha = _formatFecha(g.fecha);
        const concepto = g.concepto || '';
        const valor = parseFloat(g.valor) || 0;
        total += valor;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${fecha}</td>
            <td>${concepto}</td>
            <td>${formatearPesos(valor)}</td>
            <td>
                <button class="btn btn-danger" style="padding: 8px 12px; font-size: 12px;" onclick="eliminarGasto('${g.id}')">ELIMINAR</button>
            </td>
        `;
        tbody.appendChild(tr);
    }

    const totalEl = document.getElementById('totalGastos');
    if (totalEl) totalEl.textContent = formatearPesos(total);

    // estado visual de conexión en la pestaña
    const status = document.getElementById('gastosStatus');
    if (status) {
        status.className = 'connection-status status-connected';
        status.innerHTML = `<span>✅</span><span>Gastos cargados (${(gastosData || []).length})</span>`;
    }
}

window.eliminarGasto = async function(id) {
    if (!isConfigured) {
        mostrarAlerta('Configure el sistema primero', 'warning');
        return;
    }
    if (!id) return;

    if (!confirm('¿Eliminar este gasto?')) return;

    try {
        const sb = _ensureSupabase();
        const { error } = await sb.from('gastos').delete().eq('id', id);
        if (error) throw error;

        mostrarAlerta('✅ Gasto eliminado', 'success');
        await cargarGastos();
    } catch (error) {
        console.error('❌ Error eliminando gasto:', error);
        mostrarAlerta('❌ No se pudo eliminar el gasto: ' + (error.message || error), 'danger');
    }
};

document.addEventListener('DOMContentLoaded', async function() {
            console.log('🎯 DOM cargado, inicializando sistema...');
            await verificarSesion();
            // Inicializar pestaña de gastos
            prepararGastosUI();

            // Cargar configuración guardada (Supabase)
            if (supabaseUrl && supabaseAnonKey) {
                const urlInput = document.getElementById('supabaseUrl');
                const keyInput = document.getElementById('supabaseAnonKey');
                if (urlInput) urlInput.value = supabaseUrl;
                if (keyInput) keyInput.value = supabaseAnonKey;

                updateConnectionStatus('connected', 'Configuración Supabase cargada');
                isConfigured = true;
                // Nota: el usuario puede presionar "ACTUALIZAR" en cada pestaña cuando quiera, pero cargamos al iniciar
                cargarTodosLosDatos().catch(err => console.error('Error cargando datos iniciales:', err));
            } else {
                updateConnectionStatus('disconnected', 'Configure Supabase para comenzar');
            }

            // Cargar datos de empresa
            document.getElementById('nombreEmpresa').value = config.nombreEmpresa;
            document.getElementById('direccionEmpresa').value = config.direccionEmpresa;
            document.getElementById('telefonoEmpresa').value = config.telefonoEmpresa;

            console.log('✅ Sistema inicializado correctamente');
        });

        console.log('🎯 Todas las funciones definidas correctamente');

        // =================== FUNCIONES DE AUTENTICACIÓN (SUPABASE AUTH) ===================

        /**
         * Usuarios permitidos (1:1 con usuarios creados en Supabase Auth).
         * Mantiene compatibilidad con el login de "usuario + clave".
         *
         * - Si el usuario escribe un EMAIL, se usa tal cual.
         * - Si escribe un alias, se traduce al email correspondiente.
         */
        const USUARIOS_PERMITIDOS = [
            {
                alias: 'leiner',
                email: 'leinerparra@outlook.es',
            },
            {
                alias: 'gloria',
                email: 'gloriae1021@gmail.com',
                // Por si el usuario fue creado con .con por error, intentamos también esa variante
                altEmails: ['gloriae1021@gmail.con']
            },
            // Compatibilidad con el usuario anterior "pesquera" (lo tratamos como alias de gloria)
            {
                alias: 'pesquera',
                email: 'gloriae1021@gmail.com',
                altEmails: ['gloriae1021@gmail.con']
            }
        ];

        function _resolverEmailDesdeUsuario(inputUsuario) {
            const u = String(inputUsuario || '').trim();
            if (!u) return null;

            // Si parece email, úsalo tal cual
            if (u.includes('@')) return { primary: u, alts: [] };

            const key = u.toLowerCase();
            const found = USUARIOS_PERMITIDOS.find(x => x.alias.toLowerCase() === key);
            if (!found) return null;
            return { primary: found.email, alts: Array.isArray(found.altEmails) ? found.altEmails : [] };
        }

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

        // Función para iniciar sesión (contra Supabase Auth)
        async function iniciarSesion(event) {
            event.preventDefault();

            const usuario = document.getElementById('username').value.trim();
            const contraseña = document.getElementById('password').value;
            const loginBtn = document.getElementById('loginBtn');
            const errorDiv = document.getElementById('loginError');

            errorDiv.style.display = 'none';

            // Deshabilitar botón y mostrar carga
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="loading"></span> INICIANDO...';

            try {
                const resolved = _resolverEmailDesdeUsuario(usuario);
                if (!resolved) {
                    throw new Error('Usuario no permitido. Use: leiner o gloria (o su email).');
                }

                const sb = _ensureSupabase();

                // Intentamos con email principal y alternos (por el caso .con)
                const emailsToTry = [resolved.primary, ...(resolved.alts || [])].filter(Boolean);
                let lastError = null;

                for (const email of emailsToTry) {
                    const { data, error } = await sb.auth.signInWithPassword({
                        email,
                        password: contraseña
                    });

                    if (!error && data && data.session) {
                        // Login exitoso
                        localStorage.setItem('ultimoLogin', new Date().toISOString());
                        mostrarSistema();

                        // Limpiar formulario
                        document.getElementById('username').value = '';
                        document.getElementById('password').value = '';
                        return;
                    }

                    lastError = error || new Error('No se pudo iniciar sesión');
                }

                throw lastError || new Error('Usuario o contraseña incorrectos');
            } catch (e) {
                console.error('❌ Error de inicio de sesión:', e);
                errorDiv.textContent = '❌ ' + (e.message || 'No se pudo iniciar sesión');
                errorDiv.style.display = 'block';
                document.getElementById('password').value = '';
                document.getElementById('password').focus();
            } finally {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '🔑 INICIAR SESIÓN';
            }
        }

        // Función para mostrar el sistema principal
        function mostrarSistema() {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('sistemaPrincipal').style.display = 'block';

            console.log('✅ Sesión iniciada correctamente');

            // Cargar datos si ya está configurado (Supabase)
            if (supabaseUrl && supabaseAnonKey) {
                cargarTodosLosDatos();
            }
        }

        // Función para cerrar sesión
        async function cerrarSesion() {
            if (!confirm('¿Está seguro que desea cerrar sesión?')) return;

            try {
                const sb = _ensureSupabase();
                await sb.auth.signOut();
            } catch (e) {
                console.warn('⚠️ No se pudo cerrar sesión en Supabase (continuando):', e);
            }

            localStorage.removeItem('ultimoLogin');

            document.getElementById('sistemaPrincipal').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'flex';

            // Limpiar datos sensibles
            ventaActual = [];

            console.log('🚪 Sesión cerrada correctamente');
        }

        // Verificar sesión al cargar la página (manejado por Supabase, persistente)
        async function verificarSesion() {
            try {
                const sb = _ensureSupabase();
                const { data } = await sb.auth.getSession();
                const session = data && data.session;

                if (session) {
                    mostrarSistema();
                    return;
                }
            } catch (e) {
                console.warn('⚠️ No se pudo verificar sesión (mostrando login):', e);
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
            // Si no hay ventas, igual actualizamos el valor del inventario y dejamos la tabla vacía.
            if (ventasCompletasData.length === 0) {
                actualizarTablaUltimasVentas([]);
                actualizarEstadisticasFiltradas([]);
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
                        // Normalizar fecha (soporta 'dd/m/yyyy' y 'dd/m/yyyy, hh:mm:ss a. m./p. m.')
                        const fechaSolo = String(venta.fecha).split(',')[0].trim();
                        const parts = fechaSolo.split('/');
                        const fechaVenta = (parts.length === 3) ? new Date(`${parts[2]}-${String(parts[1]).padStart(2,'0')}-${String(parts[0]).padStart(2,'0')}T00:00:00`) : new Date(fechaSolo);
                        
                        if (!isNaN(fechaVenta.getTime())) {
                            if (filtroFechaDesde) {
                                const fechaDesde = new Date(filtroFechaDesde);
                                if (fechaVenta < fechaDesde) return false;
                            }
                            
                            if (filtroFechaHasta) {
                                const fechaHasta = new Date(filtroFechaHasta);
                                fechaHasta.setHours(23, 59, 59, 999); // Incluir todo el día
                                if (fechaVenta > fechaHasta) return false;
                            }
                        } else {
                            return false;
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
                    // Normalizar fecha (soporta 'dd/m/yyyy' y 'dd/m/yyyy, hh:mm:ss a. m./p. m.')
                    const fechaSolo = String(venta.fecha).split(',')[0].trim();
                    const parts = fechaSolo.split('/');
                    const fecha = (parts.length === 3) ? new Date(`${parts[2]}-${String(parts[1]).padStart(2,'0')}-${String(parts[0]).padStart(2,'0')}T00:00:00`) : new Date(fechaSolo);
                    
                    if (!isNaN(fecha.getTime()) && fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual) {
                        totalMes += venta.total;
	                        // Calcular ganancia del mes (la ganancia SI debe bajar si hay descuento)
	                        let gananciaVentaMes = 0;
	                        const productosVenta = _normalizeProductosField(venta.productos);
	                        for (const productoStr of productosVenta) {
	                            const producto = parsearProducto(productoStr);
	                            if (producto && preciosData[producto.tipo]) {
	                                const gananciaPorKilo = preciosData[producto.tipo].ganancia || 0;
	
	                                if (producto.unidad === 'lbs') {
	                                    // Datos antiguos en libras: dividir entre 2.20462 para pasar ganancia a libra
	                                    const gananciaPorLibra = gananciaPorKilo / KILOS_A_LIBRAS;
	                                    gananciaVentaMes += (producto.cantidad * gananciaPorLibra);
	                                } else {
	                                    // Datos nuevos en kilos: usar la ganancia por kilo tal cual
	                                    gananciaVentaMes += (producto.cantidad * gananciaPorKilo);
	                                }
	                            }
	                        }
	
	                        // Descuento (global) reduce directamente la ganancia
	                        gananciaVentaMes -= (Number(venta.descuentoTotal) || 0);
	                        gananciasMes += gananciaVentaMes;
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

            // Volver a mostrar todos los datos (aun si no hay ventas)
            actualizarTablaUltimasVentas(ventasCompletasData.slice(-10).reverse());
            aplicarFiltrosReportes(); // Recalcular estadísticas (incluye totalInventario)
            mostrarAlerta('Filtros limpiados', 'success');
        }

        // =================== REGENERAR FACTURA ===================

        // Función para regenerar y mostrar una factura anterior
        function regenerarFactura(numero, fecha, cliente, productosTexto, total, descuentoPorLibra = 0, descuentoTotal = 0, subtotalSinDescuento = 0) {
            // Parsear los productos del texto
            // Formato esperado: "Pargo (2.500 kg)" o "Pargo (2.5 lbs)" para históricos
            const productosArray = [];
            const productos = _normalizeProductosField(productosTexto);
            let totalKilosCalculado = 0;
            
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
                    totalKilosCalculado += cantidad;
                    
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

            // =================== RECONSTRUIR DESCUENTOS SI NO VIENEN GUARDADOS ===================
            // En algunas ventas antiguas (o si por algún motivo no se guardó el descuento),
            // el total ya viene con descuento pero los campos descuento_total/subtotal_sin_descuento pueden venir en 0.
            // Aquí lo reconstruimos desde el subtotal calculado por producto.
            const subtotalCalculado = productosArray.reduce((sum, p) => sum + (p.subtotal || 0), 0);

            // Si descuentoTotal no viene, pero el subtotal calculado es mayor que el total, inferimos el descuento.
            if ((Number(descuentoTotal) || 0) <= 0 && subtotalCalculado > 0 && Number(total) < subtotalCalculado) {
                descuentoTotal = subtotalCalculado - Number(total);
            }

            // Si no hay subtotal guardado, lo inferimos.
            if ((Number(subtotalSinDescuento) || 0) <= 0) {
                subtotalSinDescuento = (subtotalCalculado > 0) ? subtotalCalculado : (Number(total) + Number(descuentoTotal || 0));
            }

            // Si no hay descuento por kg (antes llamado por libra), lo inferimos.
            if ((Number(descuentoPorLibra) || 0) <= 0 && (Number(descuentoTotal) || 0) > 0 && totalKilosCalculado > 0) {
                descuentoPorLibra = Number(descuentoTotal) / totalKilosCalculado;
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
                        <h2 style="margin: 5px 0;">${config.nombreEmpresa}</h2>
                        <p style="margin: 2px 0; font-size: 0.9em;">${config.direccionEmpresa}</p>
                        <p style="margin: 2px 0; font-size: 0.9em;">Tel: ${config.telefonoEmpresa}</p>
                    </div>
                    
                    <div style="text-align: center; margin: 10px 0; padding: 8px 0; border-bottom: 1px dashed #000;">
                        <p style="margin: 2px 0;"><strong>FACTURA #${numero.toString().padStart(6, '0')}</strong></p>
                        <p style="margin: 2px 0; font-size: 0.85em;">Fecha: ${fecha}</p>
                        <p style="margin: 5px 0; font-weight: bold; font-size: 0.9em;">REIMPRESION</p>
                    </div>
                    
                    <div style="margin: 10px 0; padding: 5px 0; border-bottom: 1px dashed #000;">
                        <p style="margin: 2px 0; font-size: 0.9em;"><strong>CLIENTE:</strong></p>
                        <p style="margin: 2px 0; font-size: 0.85em;">${cliente}</p>
                    </div>
                    
                    <table style="width: 100%; margin: 10px 0; border-collapse: collapse; font-size: 1em; table-layout: fixed;">
                        <colgroup>
                            <col style="width: 40%;">
                            <col style="width: 30%;">
                            <col style="width: 30%;">
                        </colgroup>
                        <thead>
                            <tr style="border-bottom: 2px solid #000;">
                                <th style="padding: 5px 3px; text-align: left; width: 40%; font-size: 1em;">PRODUCTO</th>
                                <th style="padding: 5px 3px; text-align: center; width: 30%; font-size: 1em;">CANT</th>
                                <th style="padding: 5px 3px; text-align: right; width: 30%; font-size: 1em;">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productosArray.map(producto => `
                                <tr style="border-bottom: 1px dashed #ccc;">
                                    <td style="padding: 5px 3px; text-align: left; width: 40%; font-size: 1em; font-weight: bold;">${producto.tipo}</td>
                                    <td style="padding: 5px 3px; text-align: center; width: 30%; font-size: 1em;">${producto.cantidad.toFixed(producto.unidad === 'kg' ? 3 : 1)} ${producto.unidad}</td>
                                    <td style="padding: 5px 3px; text-align: right; width: 30%; font-size: 1em;"><strong>${formatearPesos(producto.subtotal)}</strong></td>
                                </tr>
                                <tr style="border-bottom: 1px dashed #ccc;">
                                    <td colspan="3" style="padding: 2px 3px 5px 10px; font-size: 0.9em; text-align: left;">@ ${formatearPesos(producto.precio)}/${producto.unidad}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div style="text-align: right; padding: 10px 0; margin-top: 10px; border-top: 1px dashed #000;">
                        ${descuentoTotal > 0 ? `
                            <div style="font-size: 0.95em; margin: 5px 0;">
                                <span>Subtotal:</span> <strong>${formatearPesos(subtotalSinDescuento)}</strong>
                            </div>
                            <div style="font-size: 0.95em; margin: 5px 0;">
                                ${Number(descuentoPorLibra) > 0 ? `
                                    <span>Descuento (${formatearPesos(descuentoPorLibra)}/${productosArray[0]?.unidad || 'kg'} × ${totalKilosCalculado.toFixed(productosArray[0]?.unidad === 'kg' ? 3 : 1)} ${productosArray[0]?.unidad || 'kg'}):</span>
                                ` : `
                                    <span>Descuento:</span>
                                `}
                                <strong>-${formatearPesos(descuentoTotal)}</strong>
                            </div>
                            <div style="border-top: 2px solid #000; margin: 8px 0; padding-top: 8px;">
                        ` : '<div style="border-top: 2px solid #000; padding-top: 8px;">'}
                            <div style="font-size: 1.4em; font-weight: bold;">
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
                if (error.message.includes('')) {
                    mensajeUsuario = '❌ Error de conexión con Supabase. Verifique:\n' +
                                   '1. La URL del  está correcta\n' +
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
            if (!isConfigured) throw new Error('Sistema no configurado');

            const sb = _ensureSupabase();
            const numeroFactura = parseInt(String(numero).replace('#',''), 10);
            if (!Number.isFinite(numeroFactura)) throw new Error('Número de factura inválido');

            console.log('🗑️ Eliminando factura #' + numeroFactura + ' (restaurando inventario)');

            // 1) Leer la venta real desde Supabase (fuente de verdad)
            const { data: ventaDB, error: errVenta } = await sb
                .from('ventas')
                .select('numero_factura,fecha,cliente,productos,total')
                .eq('numero_factura', numeroFactura)
                .maybeSingle();
            if (errVenta) throw errVenta;

            const productosField = (ventaDB && ventaDB.productos != null) ? ventaDB.productos : productosTexto;
            const productosArr = _normalizeProductosField(productosField);

            // 2) Parsear productos y cantidades (KG por defecto; si viene lbs, se convierte a KG)
            const toNumber = (v) => {
                if (v == null) return NaN;
                const s = String(v).trim().replace(',', '.');
                return parseFloat(s);
            };

            const devPorTipo = new Map(); // tipo -> cantidadKg
            for (const p of (productosArr || [])) {
                const str = String(p || '').trim();
                // soporta: "Pargo (2.500 kg)", "Pargo (2.5 kgs)", "Pargo (2.5 lbs)" y variantes
                const m = str.match(/^(.+?)\s*\(([0-9.,]+)\s*(kg|kgs|kilo|kilos|lb|lbs)\)\s*$/i);
                if (!m) continue;
                const tipo = m[1].trim();
                let cantidad = toNumber(m[2]);
                const unidad = (m[3] || 'kg').toLowerCase();
                if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
                // Convertir a KG si viene en libras
                if (unidad.startsWith('lb')) cantidad = cantidad * 0.45359237;
                const prev = devPorTipo.get(tipo) || 0;
                devPorTipo.set(tipo, prev + cantidad);
            }

            console.log('📦 Productos a devolver (kg):', Object.fromEntries(devPorTipo));

            // 3) Restaurar inventario (sumar stock)
            for (const [tipo, cantidadKg] of devPorTipo.entries()) {
                const { data: invRow, error: invErr } = await sb
                    .from('inventario')
                    .select('tipo,stock,precio_compra')
                    .eq('tipo', tipo)
                    .maybeSingle();
                if (invErr) throw invErr;

                const stockActual = (invRow && Number.isFinite(parseFloat(invRow.stock))) ? parseFloat(invRow.stock) : 0;
                const precioCompra = (invRow && Number.isFinite(parseFloat(invRow.precio_compra))) ? parseFloat(invRow.precio_compra) : 0;
                const nuevoStock = stockActual + cantidadKg;
                const valorTotal = nuevoStock * precioCompra;

                const up = await sb.from('inventario').upsert({
                    tipo,
                    stock: nuevoStock,
                    precio_compra: precioCompra,
                    valor_total: valorTotal,
                    ultima_actualizacion: new Date().toISOString()
                }, { onConflict: 'tipo' });
                if (up.error) throw up.error;
                console.log(`✅ Inventario restaurado: ${tipo} +${cantidadKg.toFixed(3)} kg (stock: ${nuevoStock.toFixed(3)})`);
            }

            // 4) Eliminar venta
            const delVenta = await sb.from('ventas').delete().eq('numero_factura', numeroFactura);
            if (delVenta.error) throw delVenta.error;

            // 4.5) Si esa venta estaba marcada como "debe", también eliminar el registro en deudores
            // (si no existe, no pasa nada; pero si existe, evita que quede "colgada" en la pestaña Deudas)
            const delDeuda = await sb.from('deudores').delete().eq('numero_factura', numeroFactura);
            if (delDeuda.error) throw delDeuda.error;

            // 5) Registrar eliminación (auditoría)
            const productosTxt = (productosArr || []).join(', ');
            const insElim = await sb.from('eliminaciones').insert({
                fecha: new Date().toISOString(),
                numero_factura: numeroFactura,
                cliente: (ventaDB && ventaDB.cliente) ? ventaDB.cliente : (cliente || ''),
                productos: productosTxt,
                total: (ventaDB && ventaDB.total != null) ? parseFloat(ventaDB.total) : (parseFloat(total) || 0),
                motivo: motivo || '',
                usuario: 'admin'
            });
            if (insElim.error) throw insElim.error;

            console.log('✅ Factura eliminada y stock restaurado');
        }

