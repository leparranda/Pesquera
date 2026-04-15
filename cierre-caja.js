// =================== MÓDULO CIERRE DE CAJA ===================
// Toda la data persiste en Supabase (no localStorage)
'use strict';

function _sb() {
    if (window.__pesqueraSupabaseClient) return window.__pesqueraSupabaseClient;
    throw new Error('Supabase no está inicializado. Conéctese primero desde Configuración.');
}
function _hoy() {
    var n = new Date();
    return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
}
function _isoStart(d) { return new Date(d+'T00:00:00').toISOString(); }
function _isoEnd(d)   { return new Date(d+'T23:59:59').toISOString(); }
function _fmt(n) {
    if (!n && n !== 0) return '$0';
    return '$' + Math.round(n).toLocaleString('es-CO');
}
function _alertCaja(msg, tipo) {
    tipo = tipo || 'success';
    var sec = document.getElementById('cierre-caja');
    if (!sec) return;
    var prev = sec.querySelector('.alert-caja-msg');
    if (prev) prev.remove();
    var div = document.createElement('div');
    div.className = 'alert alert-' + tipo + ' alert-caja-msg';
    div.textContent = msg;
    sec.insertBefore(div, sec.firstChild);
    setTimeout(function(){ div.remove(); }, 6000);
}

// ─── Configuracion de caja (Supabase) ──────────────────────────
async function _getConfigCaja() {
    var r = await _sb().from('configuracion_caja').select('*').eq('id',1).maybeSingle();
    if (r.error) throw r.error;
    return r.data || { id: 1, saldo_inicial: 0, historico_pagadas: [] };
}
async function _saveConfigCaja(patch) {
    var r = await _sb().from('configuracion_caja').upsert(Object.assign({ id: 1 }, patch), { onConflict: 'id' });
    if (r.error) throw r.error;
}

// ─── IDs de facturas de historico marcadas como pagadas ─────────
async function _getHistoricoPagadoIds() {
    try {
        var cfg = await _getConfigCaja();
        var arr = Array.isArray(cfg.historico_pagadas) ? cfg.historico_pagadas : JSON.parse(cfg.historico_pagadas || '[]');
        return new Set(arr.map(String));
    } catch(e) { return new Set(); }
}
// Versión síncrona en caché para el render de tablas (se actualiza al abrir pestaña)
var _cachedPagadas = new Set();
window.getHistoricoPagadoIds = function() { return _cachedPagadas; };

async function _recargarPagadas() {
    _cachedPagadas = await _getHistoricoPagadoIds();
}

window.marcarFacturaProveedorPagada = async function(id, proveedor, valor) {
    if (!id) return;
    if (!confirm('Marcar como pagada la factura ' + (proveedor ? 'de ' + proveedor : '') + ' por ' + _fmt(valor) + '?\n\nEsta factura quedara excluida del calculo de deuda pendiente.')) return;
    try {
        var ids = await _getHistoricoPagadoIds();
        ids.add(String(id));
        await _saveConfigCaja({ historico_pagadas: JSON.stringify([...ids]) });
        _cachedPagadas = ids;
        if (typeof actualizarTablaHistorico === 'function' && window.datosHistoricoCompletos) {
            actualizarTablaHistorico(window.datosHistoricoCompletos);
        }
        await _actualizarTablaDeudaProveedores();
        _alertCaja('Factura marcada como pagada.', 'success');
    } catch(err) { _alertCaja('Error: ' + err.message, 'danger'); }
};

window.desmarcarFacturaProveedorPagada = async function(id) {
    if (!id) return;
    if (!confirm('Desmarcar esta factura? Volvera a contar como deuda pendiente con el proveedor.')) return;
    try {
        var ids = await _getHistoricoPagadoIds();
        ids.delete(String(id));
        await _saveConfigCaja({ historico_pagadas: JSON.stringify([...ids]) });
        _cachedPagadas = ids;
        if (typeof actualizarTablaHistorico === 'function' && window.datosHistoricoCompletos) {
            actualizarTablaHistorico(window.datosHistoricoCompletos);
        }
        await _actualizarTablaDeudaProveedores();
        _alertCaja('Factura desmarcada.', 'success');
    } catch(err) { _alertCaja('Error: ' + err.message, 'danger'); }
};

// ─── Inicializar pestana ────────────────────────────────────────
window.iniciarCierreCaja = async function() {
    var hoy = _hoy();
    ['cajaFecha','cajaFechaProveedor','cajaIngresoFecha'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el && !el.value) el.value = hoy;
    });
    try {
        var cfg = await _getConfigCaja();
        var inputSaldo = document.getElementById('cajaSaldoInicial');
        if (inputSaldo) inputSaldo.value = cfg.saldo_inicial || '';
        // Cargar caché de pagadas
        var arr = Array.isArray(cfg.historico_pagadas) ? cfg.historico_pagadas : JSON.parse(cfg.historico_pagadas || '[]');
        _cachedPagadas = new Set(arr.map(String));
    } catch(e) {}
    _cargarProveedoresHistorico();
    _actualizarTablaDeudaProveedores();
    // Calcular automaticamente con la fecha de hoy al abrir la pestana
    setTimeout(function() { window.calcularCierreCaja(); }, 300);
};

// ─── Saldo inicial ─────────────────────────────────────────────
window.guardarSaldoInicial = async function() {
    var passEl  = document.getElementById('cajaSaldoPassword');
    var montoEl = document.getElementById('cajaSaldoInicial');
    var pass  = passEl ? passEl.value.trim() : '';
    var monto = montoEl ? (parseFloat(montoEl.value) || 0) : 0;
    if (pass !== CONTRASEÑA_ELIMINACION) {
        _alertCaja('Contraseña incorrecta. El saldo inicial no fue cambiado.', 'danger');
        if (passEl) passEl.value = '';
        return;
    }
    if (monto < 0) { _alertCaja('El saldo inicial no puede ser negativo.', 'warning'); return; }
    try {
        await _saveConfigCaja({ saldo_inicial: monto });
        if (passEl) passEl.value = '';
        _alertCaja('Saldo inicial guardado: ' + _fmt(monto), 'success');
    } catch(err) { _alertCaja('Error al guardar: ' + err.message, 'danger'); }
};

// ─── Proveedores datalist ───────────────────────────────────────
async function _cargarProveedoresHistorico() {
    try {
        var r = await _sb().from('historico').select('proveedor').neq('proveedor','').neq('proveedor',null);
        if (r.error) return;
        var unicos = [...new Set((r.data||[]).map(function(x){ return x.proveedor; }).filter(Boolean))].sort();
        var dl = document.getElementById('listaProveedoresCaja');
        if (dl) dl.innerHTML = unicos.map(function(p){ return '<option value="'+p+'">'; }).join('');
    } catch(e) {}
}

// ─── Pagos a proveedores (Supabase) ────────────────────────────
async function _getPagosProveedores(fecha) {
    var q = _sb().from('pagos_proveedores').select('*').order('fecha', { ascending: false });
    if (fecha) q = q.eq('fecha', fecha);
    var r = await q;
    if (r.error) throw r.error;
    return r.data || [];
}

window.registrarPagoProveedor = async function() {
    var provEl  = document.getElementById('cajaProveedor');
    var montoEl = document.getElementById('cajaMontoProveedor');
    var fechaEl = document.getElementById('cajaFechaProveedor');
    var proveedor = provEl ? provEl.value.trim() : '';
    var monto     = montoEl ? (parseFloat(montoEl.value)||0) : 0;
    var fecha     = fechaEl ? (fechaEl.value || _hoy()) : _hoy();
    if (!proveedor) { _alertCaja('Ingrese el nombre del proveedor.','warning'); return; }
    if (monto <= 0) { _alertCaja('El monto debe ser mayor a cero.','warning'); return; }
    try {
        var r = await _sb().from('pagos_proveedores').insert({ proveedor: proveedor, monto: monto, fecha: fecha });
        if (r.error) throw r.error;
        if (provEl)  provEl.value  = '';
        if (montoEl) montoEl.value = '';
        _alertCaja('Pago de ' + _fmt(monto) + ' a ' + proveedor + ' registrado.', 'success');
        _actualizarTablaDeudaProveedores();
    } catch(err) { _alertCaja('Error: ' + err.message, 'danger'); }
};

// ─── Ingresos extra (Supabase) ─────────────────────────────────
async function _getIngresosCaja(fecha) {
    var q = _sb().from('ingresos_caja').select('*').order('fecha', { ascending: false });
    if (fecha) q = q.eq('fecha', fecha);
    var r = await q;
    if (r.error) throw r.error;
    return r.data || [];
}

window.registrarIngresoCaja = async function() {
    var concEl  = document.getElementById('cajaIngresoConcepto');
    var montoEl = document.getElementById('cajaIngresoMonto');
    var fechaEl = document.getElementById('cajaIngresoFecha');
    var concepto = concEl  ? concEl.value.trim() : '';
    var monto    = montoEl ? (parseFloat(montoEl.value)||0) : 0;
    var fecha    = fechaEl ? (fechaEl.value || _hoy()) : _hoy();
    if (!concepto) { _alertCaja('Ingrese el concepto del ingreso.','warning'); return; }
    if (monto <= 0) { _alertCaja('El monto debe ser mayor a cero.','warning'); return; }
    try {
        var r = await _sb().from('ingresos_caja').insert({ concepto: concepto, monto: monto, fecha: fecha });
        if (r.error) throw r.error;
        if (concEl)  concEl.value  = '';
        if (montoEl) montoEl.value = '';
        _alertCaja('Ingreso de ' + _fmt(monto) + ' registrado: "' + concepto + '"', 'success');
    } catch(err) { _alertCaja('Error: ' + err.message, 'danger'); }
};

// ─── Tabla deuda proveedores (una fila por factura) ─────────────
async function _actualizarTablaDeudaProveedores() {
    var tbody = document.querySelector('#tablaDeudaProveedores tbody');
    if (!tbody) return;
    try {
        var sb = _sb();
        var pagadas = _cachedPagadas.size > 0 ? _cachedPagadas : await _getHistoricoPagadoIds();

        // Traer todas las facturas del historico con proveedor
        var r1 = await sb.from('historico')
            .select('id, proveedor, valor_total, fecha, tipo, cantidad, numero_factura_proveedor')
            .neq('proveedor','').neq('proveedor',null)
            .order('fecha', { ascending: false });
        if (r1.error) throw r1.error;
        var facturas = r1.data || [];

        // Traer todos los abonos por proveedor
        var r2 = await sb.from('pagos_proveedores').select('proveedor, monto');
        if (r2.error) throw r2.error;
        var abonosPorProv = {};
        (r2.data||[]).forEach(function(a) {
            abonosPorProv[a.proveedor] = (abonosPorProv[a.proveedor]||0) + (parseFloat(a.monto)||0);
        });

        if (!facturas.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">No hay registros de proveedores en el historico.</td></tr>';
            return;
        }

        // Agrupar facturas por proveedor
        var grupos = {};
        facturas.forEach(function(f) {
            var p = f.proveedor || 'Sin nombre';
            if (!grupos[p]) grupos[p] = [];
            grupos[p].push(f);
        });

        var html = '';
        var hayDeudas = false;

        Object.keys(grupos).sort().forEach(function(proveedor) {
            var filas = grupos[proveedor];
            var totalFacturado = filas.reduce(function(s,f){ return s+(parseFloat(f.valor_total)||0); },0);
            var totalPagado    = filas.filter(function(f){ return pagadas.has(String(f.id)); })
                                      .reduce(function(s,f){ return s+(parseFloat(f.valor_total)||0); },0);
            var totalAbonado   = abonosPorProv[proveedor] || 0;
            var saldoReal      = totalFacturado - totalPagado - totalAbonado;

            if (saldoReal <= 0) return;
            hayDeudas = true;

            html += '<tr style="background:linear-gradient(45deg,#343a40,#495057);color:white;">' +
                    '<td colspan="3"><strong>' + proveedor + '</strong></td>' +
                    '<td colspan="2" style="text-align:right;font-weight:bold;font-size:1.05em;color:#ff8a80;">Saldo: ' + _fmt(saldoReal) + '</td></tr>';

            var pendientes = filas.filter(function(f){ return !pagadas.has(String(f.id)); });
            pendientes.forEach(function(f) {
                var fechaStr = '';
                try { fechaStr = new Date(f.fecha).toLocaleDateString('es-CO'); } catch(e) { fechaStr = f.fecha||''; }
                var numFact = f.numero_factura_proveedor || '<span style="color:#aaa;font-size:11px;">Sin numero</span>';
                var detalle = (f.tipo||'') + (f.cantidad > 0 ? ' — ' + parseFloat(f.cantidad).toFixed(2) + ' kg' : '');
                var btnPago = f.id
                    ? '<button onclick="marcarFacturaProveedorPagada(''+f.id+'',''+String(proveedor).replace(/'/g,"\\'")+ '','+f.valor_total+')" style="background:#28a745;color:white;border:none;padding:4px 9px;border-radius:4px;cursor:pointer;font-size:11px;">Marcar pagada</button>'
                    : '';
                html += '<tr>' +
                    '<td style="padding-left:18px;font-family:monospace;font-size:12px;">' + numFact + '</td>' +
                    '<td>'+fechaStr+'</td>' +
                    '<td>'+detalle+'</td>' +
                    '<td style="text-align:right;font-weight:bold;color:#c62828;">'+_fmt(f.valor_total)+'</td>' +
                    '<td>' + btnPago + '</td>' +
                    '</tr>';
            });

            if (totalAbonado > 0) {
                html += '<tr style="background:#f0fff4;">' +
                    '<td colspan="3" style="padding-left:18px;color:#155724;font-style:italic;">Abonos parciales registrados</td>' +
                    '<td style="text-align:right;color:#155724;font-weight:bold;">- ' + _fmt(totalAbonado) + '</td>' +
                    '<td></td></tr>';
            }
            html += '<tr><td colspan="5" style="padding:3px;background:#f8f9fa;"></td></tr>';
        });

        if (!hayDeudas) {
            html = '<tr><td colspan="5" style="text-align:center;color:#28a745;padding:20px;font-weight:bold;">No hay deudas pendientes con proveedores.</td></tr>';
        }

        tbody.innerHTML = html;
    } catch(err) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#dc3545;text-align:center;padding:15px;">Error: '+err.message+'</td></tr>';
    }
}

// ─── CALCULAR CIERRE DE CAJA ────────────────────────────────────
window.calcularCierreCaja = async function() {
    var fechaEl = document.getElementById('cajaFecha');
    var fecha = fechaEl ? fechaEl.value : '';
    if (!fecha) { _alertCaja('Seleccione una fecha.','warning'); return; }

    var btn = document.querySelector('button[onclick="calcularCierreCaja()"]');
    if (btn) { btn.textContent = 'CALCULANDO...'; btn.disabled = true; }

    try {
        var sb    = _sb();
        var desde = _isoStart(fecha);
        var hasta = _isoEnd(fecha);

        // 1. Ventas del dia
        var r1 = await sb.from('ventas').select('total, tipo_pago, cliente, numero_factura')
            .gte('fecha', desde).lte('fecha', hasta).order('numero_factura', { ascending: true });
        if (r1.error) throw r1.error;
        var ventas = r1.data || [];
        var ventasPagadas = 0, ventasFiado = 0;
        ventas.forEach(function(v) {
            var t = parseFloat(v.total)||0;
            if ((v.tipo_pago||'pagado') === 'adeuda') ventasFiado += t;
            else ventasPagadas += t;
        });

        // 2. Gastos del dia
        var r2 = await sb.from('gastos').select('valor, concepto').gte('fecha', desde).lte('fecha', hasta);
        if (r2.error) throw r2.error;
        var gastos = r2.data || [];
        var totalGastos = gastos.reduce(function(s,g){ return s+(parseFloat(g.valor)||0); }, 0);

        // 3. Ingresos extra del dia (Supabase)
        var ingresosLista = await _getIngresosCaja(fecha);
        var ingresosDia   = ingresosLista.reduce(function(s,i){ return s+(parseFloat(i.monto)||0); }, 0);

        // 4. Pagos a proveedores del dia (Supabase)
        var pagosProvLista = await _getPagosProveedores(fecha);
        var pagosProv      = pagosProvLista.reduce(function(s,a){ return s+(parseFloat(a.monto)||0); }, 0);

        // 5. Saldo inicial (Supabase)
        var cfg = await _getConfigCaja();
        var saldoInicial = parseFloat(cfg.saldo_inicial) || 0;
        var saldoFinal   = saldoInicial + ventasPagadas + ingresosDia - totalGastos - pagosProv;

        // Mostrar tarjetas
        document.getElementById('cajaSaldoInicialDisplay').textContent  = _fmt(saldoInicial);
        document.getElementById('cajaVentasDia').textContent            = _fmt(ventasPagadas);
        document.getElementById('cajaIngresosDia').textContent          = _fmt(ingresosDia);
        document.getElementById('cajaFiadoDia').textContent             = _fmt(ventasFiado);
        document.getElementById('cajaGastosDia').textContent            = _fmt(totalGastos);
        document.getElementById('cajaPagoProveedoresDia').textContent   = _fmt(pagosProv);
        document.getElementById('cajaSaldoFinal').textContent           = _fmt(saldoFinal);
        document.getElementById('cajaSaldoFinal').style.color           = saldoFinal >= 0 ? '#004d40' : '#b71c1c';
        document.getElementById('cajaFormula').textContent =
            'Saldo inicial ' + _fmt(saldoInicial) + ' + Ventas ' + _fmt(ventasPagadas) +
            ' + Ingresos ' + _fmt(ingresosDia) + ' - Gastos ' + _fmt(totalGastos) +
            ' - Proveedores ' + _fmt(pagosProv);

        _construirTablaMovimientos(ventas, gastos, ingresosLista, pagosProvLista, saldoInicial);
        await _actualizarTablaDeudaProveedores();
        document.getElementById('resumenCajaDia').style.display = 'block';

    } catch(err) {
        console.error('Error cierre de caja:', err);
        _alertCaja('Error al calcular: ' + err.message, 'danger');
    } finally {
        if (btn) { btn.textContent = 'CALCULAR CIERRE DE CAJA'; btn.disabled = false; }
    }
};

// ─── Tabla de movimientos del dia ───────────────────────────────
function _construirTablaMovimientos(ventas, gastos, ingresosLista, pagosProvLista, saldoInicial) {
    var tbody = document.querySelector('#tablaMovimientosCaja tbody');
    if (!tbody) return;
    var movimientos = [];
    movimientos.push({ tipo: 'Saldo Inicial', concepto: 'Apertura de caja', valor: saldoInicial, signo: 1 });

    ventas.forEach(function(v) {
        var esDeuda = (v.tipo_pago||'pagado') === 'adeuda';
        var cliente = v.cliente || 'Sin nombre';
        var numFact = v.numero_factura ? ' (Fact. #' + String(v.numero_factura).padStart(6,'0') + ')' : '';
        movimientos.push({
            tipo: esDeuda ? 'Fiado' : 'Venta pagada',
            concepto: esDeuda ? (cliente + numFact + ' — a credito, no entra a caja') : (cliente + numFact),
            valor: parseFloat(v.total)||0,
            signo: esDeuda ? 0 : 1
        });
    });
    gastos.forEach(function(g) {
        movimientos.push({ tipo: 'Gasto', concepto: g.concepto||'Gasto', valor: parseFloat(g.valor)||0, signo: -1 });
    });
    ingresosLista.forEach(function(i) {
        movimientos.push({ tipo: 'Ingreso Extra', concepto: i.concepto, valor: parseFloat(i.monto)||0, signo: 1 });
    });
    pagosProvLista.forEach(function(a) {
        movimientos.push({ tipo: 'Pago Proveedor', concepto: a.proveedor, valor: parseFloat(a.monto)||0, signo: -1 });
    });

    tbody.innerHTML = movimientos.map(function(m) {
        var color = '#333', prefijo = '';
        if (m.signo ===  1) { color = '#2e7d32'; prefijo = '+'; }
        if (m.signo === -1) { color = '#c62828'; prefijo = '-'; }
        if (m.signo ===  0) { color = '#e65100'; prefijo = '~'; }
        return '<tr><td style="white-space:nowrap;">' + m.tipo +
               '</td><td>' + m.concepto +
               '</td><td style="color:'+color+';font-weight:bold;white-space:nowrap;text-align:right;">' +
               prefijo + _fmt(m.valor) + '</td></tr>';
    }).join('');
}

// ─── Imprimir ───────────────────────────────────────────────────
window.imprimirCierreCaja = function() {
    var resumen = document.getElementById('resumenCajaDia');
    if (!resumen || resumen.style.display === 'none') {
        _alertCaja('Primero calcule el cierre de caja.','warning'); return;
    }
    window.print();
};

// ─── Estilos impresion ──────────────────────────────────────────
(function() {
    var style = document.createElement('style');
    style.textContent = '@media print { #resumenCajaDia, #resumenCajaDia * { visibility: visible !important; } #resumenCajaDia { position: absolute; top: 0; left: 0; width: 100%; color: #000 !important; background: white !important; } }';
    document.head.appendChild(style);
})();

console.log('Modulo Cierre de Caja cargado (Supabase).');
