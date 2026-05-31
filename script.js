// ==========================================================================
// CONFIGURACIÓN DE ESTADOS DEL SIMULADOR NOTIFIER NFS2-640
// ==========================================================================

const CONFIG = {
    versión: "NFS2-640 SP V1.0",
    tiempoLampTest: 2500
};

// Referencias de la Pantalla LCD
const lcdContainer = document.getElementById('lcd-text');

// Referencias de los LEDs 3D
const leds = {
    power: document.getElementById('led-power'),
    controlsActive: document.getElementById('led-controls-active'),
    preDischarge: document.getElementById('led-pre-discharge'),
    discharge: document.getElementById('led-discharge'),
    abortActive: document.getElementById('led-abort-active'),
    fireAlarm: document.getElementById('led-fire-alarm'),
    preAlarm: document.getElementById('led-pre-alarm'),
    security: document.getElementById('led-security'),
    supervisory: document.getElementById('led-supervisory'),
    systemTrouble: document.getElementById('led-system-trouble'),
    signalsSilenced: document.getElementById('led-signals-silenced'),
    pointDisabled: document.getElementById('led-point-disabled')
};

// Estado lógico interno del sistema
let estadoSistema = {
    alarmaActiva: false,
    preAlarmaActiva: false,
    supervisionActiva: false,
    seguridadActiva: false,
    alarmasReconocidas: false,
    senalesSilenciadas: false,
    problemaSistema: false,
    puntoDeshabilitado: false,
    modoSimulacion: "NORMAL", // NORMAL, LAMP_TEST, DRILL, RESET, MENU_MAIN, MENU_READ, MENU_PROG_PASS, MENU_PROG, MENU_PROG_CBE, MENU_PROG_ZONES, MENU_PROG_TIMERS, MENU_MAINT, MENU_HISTORY
    textoBúfer: "",
    isLowerCase: false,
    bloqueoPantalla: false,
    indiceReadStatus: 0,
    colaEventos: [], // Arreglo de eventos activos scrolleables
    historialEventos: [], // Historial histórico (hasta 800)
    indiceEventoActual: 0,
    indiceHistorialActual: 0,
    bufferPassword: ""
};

// Variable para controlar los tiempos de pantalla y evitar que colisionen los mensajes
let timerEstadoVisual = null;

// ==========================================================================
// SISTEMA GESTOR DE EVENTOS Y LOGS (NUEVO)
// ==========================================================================
function agregarEvento(tipo, mainMsg, subMsg) {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const evento = { tipo, mainMsg, subMsg, timeStr };
    
    // 1. Agregar a Memoria Histórica
    estadoSistema.historialEventos.unshift(evento);
    if (estadoSistema.historialEventos.length > 800) estadoSistema.historialEventos.pop();
    
    // 2. Agregar a Cola Activa (Evita duplicados activos y eventos informativos)
    if (tipo !== "INFO") {
        const duplicado = estadoSistema.colaEventos.find(e => e.mainMsg === mainMsg);
        if (!duplicado) estadoSistema.colaEventos.push(evento);
    }
    
    estadoSistema.indiceEventoActual = estadoSistema.colaEventos.length - 1; // Auto-scroll al más reciente
    
    // 3. Activar Lógica Eléctrica
    if(tipo === "FIRE") estadoSistema.alarmaActiva = true;
    else if(tipo === "SUPER") estadoSistema.supervisionActiva = true;
    else if(tipo === "SEC") estadoSistema.seguridadActiva = true;
    else if(tipo === "PRE") estadoSistema.preAlarmaActiva = true;
    else if(tipo === "TROUBLE") estadoSistema.problemaSistema = true;
    else if(tipo === "DISABLE") estadoSistema.puntoDeshabilitado = true;
    
    estadoSistema.alarmasReconocidas = false;
    
    // 4. Renderizar si no hay menús abiertos
    if (estadoSistema.modoSimulacion === "NORMAL") {
        if (tipo === "INFO") {
            actualizarPantalla(mainMsg, subMsg);
            estadoSistema.bloqueoPantalla = true;
            clearTimeout(timerEstadoVisual);
            timerEstadoVisual = setTimeout(evaluarEstadoVisual, 3000);
        } else {
            evaluarEstadoVisual();
        }
    }
}

// ==========================================================================
// SISTEMA DE AUDIO (PIEZO BUZZER LOCAL)
// ==========================================================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const buzzer = {
    oscillator: null,
    
    initAudio: function() {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    },
    
    playContinuous: function() {
        this.stop();
        this.initAudio();
        this.oscillator = audioCtx.createOscillator();
        this.oscillator.type = 'square';
        this.oscillator.frequency.setValueAtTime(3100, audioCtx.currentTime); // Frecuencia 3.1kHz típica de paneles
        
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime); // Volumen al 8%
        
        this.oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        this.oscillator.start();
    },
    
    stop: function() {
        if (this.oscillator) {
            this.oscillator.stop();
            this.oscillator.disconnect();
            this.oscillator = null;
        }
    }
};

// Inicializar el contexto de audio en la primera interacción para evitar bloqueos del navegador
document.body.addEventListener('click', () => buzzer.initAudio(), { once: true });

// ==========================================================================
// NÚCLEO DE RENDERIZADO DE PANTALLA (Formato estricto de 2 filas x 40 caracteres)
// ==========================================================================
function actualizarPantalla(fila1, fila2 = "") {
    // Limpiar pantalla manteniendo el cursor
    lcdContainer.innerHTML = "";
    
    // Formatear texto cortando strings si exceden los 40 caracteres reglamentarios
    const f1 = fila1.substring(0, 40);
    const f2 = fila2.substring(0, 40);
    
    const textoCompleto = `${f1}\n${f2}`;
    
    const nodoTexto = document.createTextNode(textoCompleto);
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    
    lcdContainer.appendChild(nodoTexto);
    lcdContainer.appendChild(cursor);
}

let clockInterval = null;

// Inicialización del Panel al encender la PC
function inicializarPanel() {
    leds.power.classList.add('active');
    leds.controlsActive.classList.add('active');
    updateClock();
    if (!clockInterval) {
        clockInterval = setInterval(updateClock, 1000);
    }
}

function updateClock() {
    // No mostrar reloj si hay un evento activo o el usuario está usando la consola
    if (estadoSistema.modoSimulacion !== "NORMAL" || estadoSistema.alarmaActiva || estadoSistema.problemaSistema || estadoSistema.preAlarmaActiva || estadoSistema.supervisionActiva || estadoSistema.seguridadActiva || estadoSistema.textoBúfer !== "" || estadoSistema.bloqueoPantalla) return;
    
    const now = new Date();
    let h = now.getHours();
    const ampm = h >= 12 ? 'P' : 'A';
    h = h % 12 || 12;
    const m = now.getMinutes().toString().padStart(2, '0');
    const mo = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    const y = now.getFullYear().toString().slice(-2);
    
    const timeStr = `${h.toString().padStart(2, '0')}:${m}${ampm} ${mo}/${d}/${y}   NFS2-640`;
    actualizarPantalla("SYSTEM ALL SYSTEMS NORMAL", timeStr);
}

// Helper: Actualizar valor físico en la base de datos del equipo
function actualizarEstadoDispositivo(dir, nuevoEstado, nuevoValor) {
    db.update(dir, nuevoEstado, nuevoValor);
}

// Helper: Limpiar animaciones de fuego en los sensores
function limpiarSensoresVisuales() {
    document.querySelectorAll('.sensor-module').forEach(el => el.classList.remove('active'));
}

// ==========================================================================
// FUNCIONES DE CONTROL MECÁNICO (BOTONES PRINCIPALES DE OPERACIÓN)
// ==========================================================================

// 1. LAMP TEST (Prueba de Lámparas - Manual Sección 2)
document.getElementById('btn-lamp-test').addEventListener('click', () => {
    estadoSistema.modoSimulacion = "LAMP_TEST";
    
    // Encender absolutamente todos los diodos 3D
    Object.values(leds).forEach(led => led.classList.add('active'));
    
    // Llenar matriz de LCD para probar píxeles
    actualizarPantalla("########################################", "########################################");
    
    // Volver automáticamente al estado anterior tras el conteo eléctrico
    setTimeout(() => {
        Object.values(leds).forEach(led => led.classList.remove('active'));
        estadoSistema.modoSimulacion = "NORMAL";
        evaluarEstadoVisual();
    }, CONFIG.tiempoLampTest);
});

// 2. ACKNOWLEDGE (Reconocimiento de Eventos - Manual Sección 1.2)
document.getElementById('btn-acknowledge').addEventListener('click', () => {
    if (estadoSistema.modoSimulacion.startsWith("MENU")) estadoSistema.modoSimulacion = "NORMAL";
    buzzer.stop(); // El reconocimiento siempre silencia el zumbador del panel
    
    let eventActive = estadoSistema.colaEventos.length > 0;
    
    if (eventActive && !estadoSistema.alarmasReconocidas) {
        estadoSistema.alarmasReconocidas = true;
        actualizarPantalla("EVENTS ACKNOWLEDGED", "PANEL SILENCED // MONITORING STAGE");
        estadoSistema.bloqueoPantalla = true;
        clearTimeout(timerEstadoVisual);
        timerEstadoVisual = setTimeout(evaluarEstadoVisual, 2000);
    } else if (estadoSistema.modoSimulacion === "DRILL") {
        actualizarPantalla("DRILL IN PROGRESS", "ACKNOWLEDGED BY STATION OPERATOR");
    } else {
        actualizarPantalla("NO NEW EVENTS TO ACKNOWLEDGE", "SYSTEM STATE: SAFE");
        estadoSistema.bloqueoPantalla = true;
        clearTimeout(timerEstadoVisual);
        timerEstadoVisual = setTimeout(evaluarEstadoVisual, 2000);
    }
});

// 3. SIGNAL SILENCE (Silenciar Señales de Evacuación - Manual Sección 2.1)
document.getElementById('btn-signal-silence').addEventListener('click', () => {
    if (estadoSistema.modoSimulacion.startsWith("MENU")) estadoSistema.modoSimulacion = "NORMAL";
    if (estadoSistema.alarmaActiva) {
        estadoSistema.senalesSilenciadas = true;
        leds.signalsSilenced.classList.add('active');
        actualizarPantalla("SIGNALS SILENCED", "EVACUATION AUDIBLE DEVICES INHIBITED");
            estadoSistema.bloqueoPantalla = true;
            clearTimeout(timerEstadoVisual);
            timerEstadoVisual = setTimeout(evaluarEstadoVisual, 2000);
    } else {
        actualizarPantalla("SIGNAL SILENCE INVALID", "NO ACTIVE ALARM TO INHIBIT");
            estadoSistema.bloqueoPantalla = true;
        clearTimeout(timerEstadoVisual);
        timerEstadoVisual = setTimeout(evaluarEstadoVisual, 2000);
    }
});

// 4. SYSTEM RESET (Restablecimiento Completo - Manual Sección 2.2)
document.getElementById('btn-system-reset').addEventListener('click', () => {
    buzzer.stop();
    limpiarSensoresVisuales();
    clearTimeout(timerEstadoVisual);
    estadoSistema.modoSimulacion = "RESET";
    actualizarPantalla("SYSTEM RESET IN PROGRESS...", "CLEARING ALARM LOGS AND COILS");
    
    // Apagar variables de peligro
    estadoSistema.colaEventos = [];
    estadoSistema.alarmaActiva = false;
    estadoSistema.preAlarmaActiva = false;
    estadoSistema.supervisionActiva = false;
    estadoSistema.seguridadActiva = false;
    estadoSistema.alarmasReconocidas = false;
    estadoSistema.senalesSilenciadas = false;
    estadoSistema.problemaSistema = false;
    estadoSistema.puntoDeshabilitado = false;
    estadoSistema.textoBúfer = "";
    estadoSistema.bloqueoPantalla = false;

    setTimeout(() => {
        estadoSistema.modoSimulacion = "NORMAL";
        Object.values(leds).forEach(led => led.classList.remove('active'));
        evaluarEstadoVisual();
    }, 3000);
});

// 5. DRILL (Simulacro de Incendio - Requiere pulsación o simulación directa)
document.getElementById('btn-drill').addEventListener('click', () => {
    estadoSistema.modoSimulacion = "DRILL";
    estadoSistema.alarmasReconocidas = false;
    leds.fireAlarm.classList.add('active');
    actualizarPantalla("MANUAL DRILL ACTIVATED", "EVACUATE AREA IMMEDIATELY");
    buzzer.playContinuous();
});

// ==========================================================================
// RUTINAS DE CONTROL DE PRIORIDADES
// ==========================================================================
function evaluarEstadoVisual() {
    if (estadoSistema.modoSimulacion !== "NORMAL") return;
    
    estadoSistema.bloqueoPantalla = false;
    estadoSistema.textoBúfer = ""; // Limpiar el buffer si una alarma forzó la actualización

    // Reestablecer led de corriente siempre
    leds.power.classList.add('active');
    leds.controlsActive.classList.add('active');

    // Limpiar leds variables para repintarlos según jerarquía
    leds.fireAlarm.classList.remove('active');
    leds.preAlarm.classList.remove('active');
    leds.supervisory.classList.remove('active');
    leds.security.classList.remove('active');
    leds.systemTrouble.classList.remove('active');
    leds.signalsSilenced.classList.remove('active');
    leds.pointDisabled.classList.remove('active');
    
    if (estadoSistema.puntoDeshabilitado) leds.pointDisabled.classList.add('active');
    if (estadoSistema.senalesSilenciadas) leds.signalsSilenced.classList.add('active');
    
    // Repintar jerarquía
    if (estadoSistema.alarmaActiva) leds.fireAlarm.classList.add('active');
    if (estadoSistema.supervisionActiva) leds.supervisory.classList.add('active');
    if (estadoSistema.seguridadActiva) leds.security.classList.add('active');
    if (estadoSistema.preAlarmaActiva) leds.preAlarm.classList.add('active');
    if (estadoSistema.problemaSistema) leds.systemTrouble.classList.add('active');

    let soundNeeded = (estadoSistema.alarmaActiva || estadoSistema.preAlarmaActiva || estadoSistema.supervisionActiva || estadoSistema.seguridadActiva || estadoSistema.problemaSistema);

    if (estadoSistema.colaEventos.length > 0) {
        // Asegurar que el índice está en rango si se limpiaron eventos
        if (estadoSistema.indiceEventoActual >= estadoSistema.colaEventos.length || estadoSistema.indiceEventoActual < 0) {
            estadoSistema.indiceEventoActual = 0;
        }
        
        const ev = estadoSistema.colaEventos[estadoSistema.indiceEventoActual];
        const total = estadoSistema.colaEventos.length;
        const counter = `${estadoSistema.indiceEventoActual + 1}/${total}`.padStart(5, '0');
        
        let prefix = "EVT";
        if (ev.tipo === "FIRE") prefix = "ALARM";
        else if (ev.tipo === "TROUBLE") prefix = "TRBL";
        else if (ev.tipo === "SUPER") prefix = "SUPR";
        else if (ev.tipo === "SEC") prefix = "SECURITY";
        else if (ev.tipo === "PRE") prefix = "PREALARM";
        else if (ev.tipo === "DISABLE") prefix = "DISABLE";
        
        const pantallaMsg = `${counter} ${prefix}: ${ev.mainMsg}`.substring(0, 40);
        
        actualizarPantalla(pantallaMsg, ev.subMsg);
        
        if (soundNeeded && !estadoSistema.alarmasReconocidas) {
            if (!buzzer.oscillator) buzzer.playContinuous();
        } else {
            buzzer.stop();
        }
    } else {
        buzzer.stop();
        inicializarPanel();
    }
}

// ==========================================================================
// INTERFAZ DE ENTRADA POR TECLADO ALFANUMÉRICO
// ==========================================================================

function manejarMenu(valor) {
    if (valor === "Escape") {
        if (estadoSistema.modoSimulacion === "MENU_PROG_PASS") estadoSistema.modoSimulacion = "MENU_MAIN";
        else if (["MENU_PROG_CBE", "MENU_PROG_ZONES", "MENU_PROG_TIMERS"].includes(estadoSistema.modoSimulacion)) {
            estadoSistema.modoSimulacion = "MENU_PROG";
            actualizarPantalla("PROGRAMMING MENU (LEVEL 2)", "1=CBE 2=ZONES 3=TIMERS");
            return;
        }
        else if (estadoSistema.modoSimulacion !== "MENU_MAIN") estadoSistema.modoSimulacion = "MENU_MAIN";
        else {
            estadoSistema.modoSimulacion = "NORMAL";
            evaluarEstadoVisual();
            return;
        }
        
        // Forzar repintado del menú principal al usar Escape
        if (estadoSistema.modoSimulacion === "MENU_MAIN") {
            actualizarPantalla("MAIN MENU: 1=READ 2=PROG 3=HISTORY", "4=MAINTENANCE (ESC TO EXIT)");
            return;
        }
    }
    
    switch (estadoSistema.modoSimulacion) {
        case "MENU_MAIN":
            actualizarPantalla("MAIN MENU: 1=READ 2=PROG 3=HISTORY", "4=MAINTENANCE (ESC TO EXIT)");
            if (valor === "1") {
                estadoSistema.modoSimulacion = "MENU_READ";
                estadoSistema.indiceReadStatus = 0;
                mostrarReadStatus();
            } else if (valor === "2") {
                estadoSistema.modoSimulacion = "MENU_PROG_PASS";
                estadoSistema.bufferPassword = "";
                actualizarPantalla("PROGRAMMING - ENTER PASSWORD:", "");
            } else if (valor === "3") {
                estadoSistema.modoSimulacion = "MENU_HISTORY";
                estadoSistema.indiceHistorialActual = 0;
                mostrarHistorial();
            } else if (valor === "4") {
                estadoSistema.modoSimulacion = "MENU_MAINT";
                actualizarPantalla("MAINTENANCE (ESC TO GO BACK)", "BATTERY: 27.2V  /  CHARGER: OK");
            }
            break;
            
        case "MENU_PROG_PASS":
            if (/[0-9]/.test(valor) && estadoSistema.bufferPassword.length < 5) {
                estadoSistema.bufferPassword += valor;
                const stars = "*".repeat(estadoSistema.bufferPassword.length);
                actualizarPantalla("PROGRAMMING - ENTER PASSWORD:", stars);
            } else if (valor === "Enter") {
                if (estadoSistema.bufferPassword === "12345" || estadoSistema.bufferPassword === "00000") {
                    estadoSistema.modoSimulacion = "MENU_PROG";
                    actualizarPantalla("PROGRAMMING MENU (LEVEL 2)", "1=CBE 2=ZONES 3=TIMERS");
                } else {
                    actualizarPantalla("ACCESS DENIED", "INVALID PASSWORD");
                    setTimeout(() => { if(estadoSistema.modoSimulacion === "MENU_PROG_PASS") actualizarPantalla("PROGRAMMING - ENTER PASSWORD:", ""); }, 2000);
                    estadoSistema.bufferPassword = "";
                }
            }
            break;
            
        case "MENU_PROG":
            if (valor === "1") {
                estadoSistema.modoSimulacion = "MENU_PROG_CBE";
                actualizarPantalla("CBE PROGRAMMING (ESC TO GO BACK)", "EQUATION: Z01 = OR(L1M01, L1D05)");
            } else if (valor === "2") {
                estadoSistema.modoSimulacion = "MENU_PROG_ZONES";
                actualizarPantalla("ZONE PROGRAMMING (ESC TO GO BACK)", "Z01: INTERIOR LAB // NORMAL");
            } else if (valor === "3") {
                estadoSistema.modoSimulacion = "MENU_PROG_TIMERS";
                actualizarPantalla("TIMERS PROGRAMMING (ESC TO GO BACK)", "AUTO-SILENCE: 20 MIN  // WATERFLOW: 0s");
            }
            break;
            
        case "MENU_HISTORY":
            if (valor === "ArrowDown" && estadoSistema.indiceHistorialActual < estadoSistema.historialEventos.length - 1) {
                estadoSistema.indiceHistorialActual++;
                mostrarHistorial();
            } else if (valor === "ArrowUp" && estadoSistema.indiceHistorialActual > 0) {
                estadoSistema.indiceHistorialActual--;
                mostrarHistorial();
            }
            break;
            
        case "MENU_READ":
            if (valor === "ArrowDown" && estadoSistema.indiceReadStatus < db.devices.length - 1) {
                estadoSistema.indiceReadStatus++;
                mostrarReadStatus();
            } else if (valor === "ArrowUp" && estadoSistema.indiceReadStatus > 0) {
                estadoSistema.indiceReadStatus--;
                mostrarReadStatus();
            }
            break;
    }
}

function mostrarHistorial() {
    if (estadoSistema.historialEventos.length === 0) {
        actualizarPantalla("HISTORY LOG EMPTY (ESC TO GO BACK)", "NO EVENTS RECORDED YET");
        return;
    }
    const ev = estadoSistema.historialEventos[estadoSistema.indiceHistorialActual];
    const count = `${estadoSistema.indiceHistorialActual + 1}/${estadoSistema.historialEventos.length}`;
    actualizarPantalla(`HIST ${count} [${ev.timeStr}] ${ev.tipo}`, `${ev.mainMsg} / ${ev.subMsg}`.substring(0,40));
}

function mostrarReadStatus() {
    if (db.devices.length === 0) {
        actualizarPantalla("READ STATUS (ESC TO GO BACK)", "NO DEVICES CONFIGURED");
        return;
    }
    const dev = db.devices[estadoSistema.indiceReadStatus];
    const count = `${estadoSistema.indiceReadStatus + 1}/${db.devices.length}`.padStart(5, '0');
    
    // Abreviar textos largos para que no superen el límite de 40 caracteres de la pantalla LCD
    let tipoCorto = dev.tipo.replace("PHOTO SMOKE", "SMOKE").replace("HEAT DETECTOR", "HEAT").replace("PULL STATION", "PULL").replace("CONTROL MOD", "MOD");
    let valCorto = dev.valor.replace("MAINTENANCE REQ", "MAINT REQ").replace("COMMUNICATION LOST", "COMM LOST");
    
    actualizarPantalla(`${count} ${dev.dir}: ${dev.etiqueta}`, `TYPE: ${tipoCorto} | ST: ${dev.estado} | ${valCorto}`);
}

document.getElementById('btn-lower-case').addEventListener('click', () => {
    estadoSistema.isLowerCase = !estadoSistema.isLowerCase;
});

const teclasMecanicas = document.querySelectorAll('.key[data-key]');

teclasMecanicas.forEach(tecla => {
    tecla.addEventListener('click', () => {
        // Bloquear escritura si estamos en Lamp Test, Reset o Simulacro activo
        if (estadoSistema.modoSimulacion !== "NORMAL" && !estadoSistema.modoSimulacion.startsWith("MENU")) return;

        clearTimeout(timerEstadoVisual); // Proteger la sesión de escritura actual

        const valor = tecla.getAttribute('data-key');

        // Si estamos dentro del Menú, las teclas tienen un comportamiento distinto
        if (estadoSistema.modoSimulacion.startsWith("MENU")) {
            manejarMenu(valor);
            // Auto-cerrar menú después de inactividad
            timerEstadoVisual = setTimeout(() => {
                estadoSistema.modoSimulacion = "NORMAL";
                evaluarEstadoVisual();
            }, 15000);
            return;
        }
        
        if (valor === "Escape") {
            // Funcionalidad de Backspace (Borrar un caracter) si hay texto, si no hay, limpia la pantalla
            if (estadoSistema.textoBúfer.length > 0) {
                estadoSistema.textoBúfer = estadoSistema.textoBúfer.slice(0, -1);
                if (estadoSistema.textoBúfer.length === 0) {
                    evaluarEstadoVisual(); // Volver al inicio si borró todo
                } else {
                    actualizarPantalla("CONSOLA CMD:", `> ${estadoSistema.textoBúfer}`);
                }
            } else {
                evaluarEstadoVisual();
            }
            return;
        }

        if (valor === "Enter") {
            if (estadoSistema.textoBúfer.length > 0) {
                procesarComandoConsola(estadoSistema.textoBúfer);
                estadoSistema.textoBúfer = "";
            } else if (estadoSistema.colaEventos.length === 0) {
                // Enter sin texto funciona como acceso directo al menú principal
                estadoSistema.modoSimulacion = "MENU_MAIN";
                manejarMenu("");
            }
            return;
        }

        if (valor === "ArrowDown") {
            if (estadoSistema.colaEventos.length > 0) {
                estadoSistema.indiceEventoActual = (estadoSistema.indiceEventoActual + 1) % estadoSistema.colaEventos.length;
                evaluarEstadoVisual();
            }
            return;
        }
        
        if (valor === "ArrowUp") {
            if (estadoSistema.colaEventos.length > 0) {
                estadoSistema.indiceEventoActual = (estadoSistema.indiceEventoActual - 1 + estadoSistema.colaEventos.length) % estadoSistema.colaEventos.length;
                evaluarEstadoVisual();
            }
            return;
        }

        let charToAdd = valor;
        // Procesamiento del flag Lower Case para letras
        if (charToAdd.length === 1 && /[a-zA-Z]/.test(charToAdd)) {
            charToAdd = estadoSistema.isLowerCase ? charToAdd.toLowerCase() : charToAdd.toUpperCase();
        }

        if (charToAdd.length > 1 && charToAdd !== " ") return; // Ignorar botones no alfanuméricos restantes

        // Si el búfer está vacío, limpiamos la pantalla por primera vez para escribir de forma interactiva
        if (estadoSistema.textoBúfer === "") {
            actualizarPantalla("CONSOLA CMD:", "");
        }

        // Agregar carácter al búfer de comandos (Límite visual de una línea)
        if (estadoSistema.textoBúfer.length < 25) {
            estadoSistema.textoBúfer += charToAdd;
            actualizarPantalla("CONSOLA CMD:", `> ${estadoSistema.textoBúfer}`);
        }

        // Autocerrar consola y menú si no hay actividad en 15 segundos
        timerEstadoVisual = setTimeout(() => {
            if (estadoSistema.textoBúfer !== "" || estadoSistema.modoSimulacion.startsWith("MENU")) {
                estadoSistema.modoSimulacion = "NORMAL";
                evaluarEstadoVisual();
            }
        }, 15000);
    });
});

// ==========================================================================
// PROCESADOR DE COMANDOS CRÍTICOS (Simulación de eventos mecánicos de campo)
// ==========================================================================
function procesarComandoConsola(comando) {
    clearTimeout(timerEstadoVisual);
    if (estadoSistema.modoSimulacion.startsWith("MENU")) estadoSistema.modoSimulacion = "NORMAL";

    // Reemplazar espacios dobles por uno solo para evitar errores de tipeo
    const cmdClean = comando.toUpperCase().trim().replace(/\s+/g, " ");

    // Comando Especial 1: Activar Alarma de Incendio por Software
    if (cmdClean === "111" || cmdClean === "FIRE") {
        agregarEvento("FIRE", "ZONE 00", "MANUAL FIRE COMMAND ISSUED");
    }
    // Comando Especial 2: Deshabilitar un lazo/Punto (Point Disabled)
    else if (cmdClean === "DISABLE" || cmdClean === "000") {
        agregarEvento("DISABLE", "LOOP 01 NODE 23", "POINT BYPASS COMMAND");
    } 
    // Comando Especial 3: Provocar fallo de batería / sistema
    else if (cmdClean === "TROUBLE" || cmdClean === "999") {
        agregarEvento("TROUBLE", "SYSTEM TROUBLE", "LOW BATTERY LEVEL DETECTED");
    }
    // Comando Especial 4: Simular Pre-Alarma
    else if (cmdClean === "PREALARM") {
        agregarEvento("PRE", "L1D23", "SMOKE DETECTOR PRE-ALARM WARNING");
    }
    // Comando Especial 5: Simular Supervisión
    else if (cmdClean === "SUPER") {
        agregarEvento("SUPER", "BLDG 2", "VALVE TAMPER SWITCH");
    }
    // Comando Especial 6: Simular Evento de Seguridad
    else if (cmdClean === "SEC") {
        agregarEvento("SEC", "REAR EXIT", "DOOR FORCED OPEN");
    }
    // Comando Especial 7: CLEAR (Limpieza de registro)
    else if (cmdClean === "CLEAR") {
        limpiarSensoresVisuales();
        // Restaurar estado físico de la base de datos a la normalidad
        db.resetNormal();
        estadoSistema.colaEventos = [];
        estadoSistema.alarmaActiva = false;
        estadoSistema.preAlarmaActiva = false;
        estadoSistema.supervisionActiva = false;
        estadoSistema.seguridadActiva = false;
        estadoSistema.problemaSistema = false;
        estadoSistema.alarmasReconocidas = false;
        estadoSistema.senalesSilenciadas = false;
        estadoSistema.puntoDeshabilitado = false;
        agregarEvento("INFO", "SYSTEM CLEARED", "ALL COILS AND ZONES RESET");
    }
    // Comandos de Interfaz/Menú
    else if (cmdClean === "MENU" || cmdClean === "PROG") {
        estadoSistema.modoSimulacion = "MENU_MAIN";
        manejarMenu("");
    }
    // Comando Especial 8: FACTORY RESET (Restaurar base de datos de fábrica)
    else if (cmdClean === "FACTORY RESET") {
        limpiarSensoresVisuales();
        db.factoryReset();
        estadoSistema.colaEventos = [];
        estadoSistema.alarmaActiva = false;
        estadoSistema.preAlarmaActiva = false;
        estadoSistema.supervisionActiva = false;
        estadoSistema.seguridadActiva = false;
        estadoSistema.problemaSistema = false;
        estadoSistema.alarmasReconocidas = false;
        estadoSistema.senalesSilenciadas = false;
        estadoSistema.puntoDeshabilitado = false;
        agregarEvento("INFO", "FACTORY RESET", "ALL DEVICES RESTORED TO DEFAULT");
    }
    // Comando Especial 9: DELETE (Borrar dispositivo) Ej: DELETE L1D06
    else if (cmdClean.startsWith("DELETE ")) {
        const dir = cmdClean.split(" ")[1];
        if (db.remove(dir)) {
            agregarEvento("INFO", "DEVICE DELETED", `${dir} REMOVED FROM SYSTEM`);
        } else {
            actualizarPantalla("COMMAND FAILED", `DEVICE ${dir} NOT FOUND`);
            estadoSistema.bloqueoPantalla = true;
            clearTimeout(timerEstadoVisual);
            timerEstadoVisual = setTimeout(evaluarEstadoVisual, 2500);
        }
    }
    // Comando Especial 10: RENAME (Renombrar dispositivo) Ej: RENAME L1D06 OFICINA
    else if (cmdClean.startsWith("RENAME ")) {
        const parts = cmdClean.split(" ");
        const dir = parts[1];
        const newName = parts.slice(2).join(" ");
        if (newName && db.rename(dir, newName)) {
            agregarEvento("INFO", "DEVICE RENAMED", `${dir} NOW NAMED ${newName}`);
        } else {
            actualizarPantalla("COMMAND FAILED", "INVALID FORMAT OR DEVICE NOT FOUND");
            estadoSistema.bloqueoPantalla = true;
            clearTimeout(timerEstadoVisual);
            timerEstadoVisual = setTimeout(evaluarEstadoVisual, 2500);
        }
    }
    // Comando no reconocido
    else {
        actualizarPantalla("COMMAND NOT FOUND", "ERROR - INVALID ENTRY");
        estadoSistema.bloqueoPantalla = true;
        clearTimeout(timerEstadoVisual);
        timerEstadoVisual = setTimeout(evaluarEstadoVisual, 2500);
    }
}

// ==========================================================================
// SOPORTE PARA TECLADO FÍSICO (VINCULACIÓN DE TECLAS DE PC AL PANEL)
// ==========================================================================
document.addEventListener('keydown', (event) => {
    // Prevenir acciones por defecto como el scroll al presionar espacio o flechas
    if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace"].includes(event.key)) {
        event.preventDefault();
    }
    
    // Evitar procesar comandos múltiples si la tecla se mantiene presionada
    if (event.repeat) return;
    
    let key = event.key;
    
    // Mapear la tecla de borrado de PC (Backspace) a la funcionalidad Esc del panel
    if (key === "Backspace" || key === "ArrowLeft") {
        key = "Escape";
    } else if (key.length === 1 && /[A-Z]/.test(key)) {
        // Adaptar letras mayúsculas para coincidir con el atributo data-key del HTML
        key = key.toLowerCase();
    }
    
    const teclaEnPantalla = document.querySelector(`.key[data-key="${key}"]`);
    
    if (teclaEnPantalla) {
        teclaEnPantalla.click(); // Dispara la lógica interna
        // Añadir efecto visual de hundimiento
        teclaEnPantalla.classList.add('simulated-active');
        setTimeout(() => teclaEnPantalla.classList.remove('simulated-active'), 150);
    }
});

// ==========================================================================
// PANELES LATERALES DE SIMULACIÓN (MECANISMOS EXTERNOS)
// ==========================================================================

document.getElementById('btn-sim-connect').addEventListener('click', () => {
    if (estadoSistema.modoSimulacion.startsWith("MENU")) estadoSistema.modoSimulacion = "NORMAL";
    
    const typeSelect = document.getElementById('new-device-type');
    const selectedType = typeSelect.value;
    const selectedLabel = typeSelect.options[typeSelect.selectedIndex].text.replace(/ \(.*\)/, ''); // Quitar paréntesis si los hay
    
    // Encontrar el siguiente número de dirección disponible de forma automática
    let maxNum = 0;
    db.devices.forEach(d => {
        const num = parseInt(d.dir.substring(3));
        if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    const newNum = maxNum + 1;
    
    // Determinar si es módulo o detector y crear la nueva dirección (ej. L1D09 o L1M10)
    const isModule = selectedType === "PULL STATION" || selectedType === "CONTROL MOD";
    const newDir = isModule ? `L1M${newNum.toString().padStart(2, '0')}` : `L1D${newNum.toString().padStart(2, '0')}`;
    
    const newDev = {
        dir: newDir,
        tipo: selectedType,
        etiqueta: `NEW ${selectedLabel.toUpperCase()}`,
        estado: "NORMAL",
        valor: selectedType.includes("SMOKE") ? "0.0% / FT" : (selectedType.includes("HEAT") ? "25 C" : "NORMAL")
    };
    
    db.add(newDev); // Guarda el dispositivo y persiste
    
    agregarEvento("INFO", "NEW DEVICE DETECTED", `${newDir} - ${selectedType}`);
});

document.getElementById('btn-sim-disconnect').addEventListener('click', () => {
    if (estadoSistema.modoSimulacion.startsWith("MENU")) estadoSistema.modoSimulacion = "NORMAL";
    actualizarEstadoDispositivo("L1M12", "TROUBLE", "COMMUNICATION LOST");
    agregarEvento("TROUBLE", "MISSING DEVICE", "NODE 12 DISCONNECTED");
});

document.getElementById('btn-sim-dirty').addEventListener('click', () => {
    if (estadoSistema.modoSimulacion.startsWith("MENU")) estadoSistema.modoSimulacion = "NORMAL";
    actualizarEstadoDispositivo("L1D08", "TROUBLE", "MAINTENANCE REQ");
    agregarEvento("TROUBLE", "DIRTY SENSOR", "NODE 08 MAINTENANCE REQ");
});

function activarSensor(zone) {
    const modulo = document.getElementById(`module-${zone}`);
    modulo.classList.add('active'); // Muestra la flama

    if (zone === 1) {
        actualizarEstadoDispositivo("L1D01", "ALARM", "9.8% / FT");
        agregarEvento("FIRE", "ZONE 01", "DETECTOR SMOKE INTERIOR LAB");
    } else if (zone === 2) {
        actualizarEstadoDispositivo("L1D02", "ALARM", "85 C");
        agregarEvento("FIRE", "ZONE 02", "HEAT DETECTOR MAIN OFFICES");
    } else if (zone === 3) {
        actualizarEstadoDispositivo("L1M03", "ALARM", "ACTIVATED");
        agregarEvento("FIRE", "ZONE 03", "PULL STATION WAREHOUSE EXIT");
    }
}

document.getElementById('btn-trigger-1').addEventListener('click', () => activarSensor(1));
document.getElementById('btn-trigger-2').addEventListener('click', () => activarSensor(2));
document.getElementById('btn-trigger-3').addEventListener('click', () => activarSensor(3));

document.getElementById('btn-sim-trouble').addEventListener('click', () => {
    procesarComandoConsola("TROUBLE");
});

document.getElementById('btn-sim-super').addEventListener('click', () => {
    procesarComandoConsola("SUPER");
});

document.getElementById('btn-sim-clear').addEventListener('click', () => {
    procesarComandoConsola("CLEAR");
});

// Arrancar el simulador
inicializarPanel();