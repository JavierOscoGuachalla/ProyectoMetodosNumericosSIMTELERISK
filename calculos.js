/* SIMTELE-RISK · Cálculos numéricos, validaciones y valores predefinidos (JavaScript puro).
   Sustituye al antiguo server.py. No accede a la base de datos: solo calcula.
   Uso en el navegador: window.SimCalc ; en Node: require('./calculos.js') */
(function (root) {
"use strict";
const F = (k, label, unit, min, max, strict, opt) => ({ k, label, unit, min, max, strict, opt });
const CAMPOS = {
  1: [F("v0","Velocidad inicial v₀","m/s",0,100,true,false), F("a","Desaceleración base a","m/s²",0,50,true,false), F("b_arrastre","Término variable b (a(v)=a+b·v)","1/s",0,10,false,false),
      F("h","Paso h","s",0,5,true,false), F("t_reac","Tiempo de reacción","s",0,10,false,false), F("dist_disp","Distancia disponible (opcional)","m",0,10000,true,true)],
  2: [F("D0","Deterioro inicial D₀","adim",0,1,false,false), F("alpha","α (tasa lineal)","1/mes",0,1,false,false), F("beta","β (tasa cuadrática)","1/mes²",0,0.1,false,false),
      F("Dumbral","Umbral de inspección D*","adim",0,1,true,false), F("retraso","Retraso de mantenimiento","meses",0,120,false,false),
      F("tol","Tolerancia","",0,0.01,true,false), F("maxit","Iteraciones máximas","",1,200000,false,false)],
  3: [F("m","Masa m","kg",0,1e4,true,false), F("c","Amortiguamiento c","N·s/m",0,1e4,false,false), F("k","Rigidez k","N/m",0,1e6,true,false),
      F("x0","Posición inicial x₀","m",-100,100,false,false), F("v0","Velocidad inicial v₀","m/s",-100,100,false,false), F("F0","Amplitud de fuerza F₀","N",0,1e6,false,false),
      F("w","Frecuencia de fuerza ω","rad/s",0,100,false,false), F("h","Paso h","s",0,0.1,true,false), F("T","Tiempo total T","s",0,500,true,false)],
  4: [F("a","Inicio del intervalo","",-100,100,false,false), F("b","Fin del intervalo","",-100,100,false,false), F("n","Número de nodos","",4,30,false,false),
      F("sigma","Ruido σ","",0,1,false,false), F("seed","Semilla del ruido","",0,1e9,false,false), F("ocultos","Puntos ocultos","",1,10,false,false)]
};
const matNorm = n => Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=> i===j?4:Math.abs(i-j)===1?1:0));
const matEst  = n => Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=> i===j?2.2:Math.abs(i-j)===1?-1:0));
const matHil  = n => Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=> 1/(i+j+1)));
const mk = (A, xs) => ({ A, b: A.map(r => r.reduce((s, a, j) => s + a * xs[j], 0)) });
const PRESETS = {
  1: { NORMAL: {v0:5,a:1,b_arrastre:0,h:0.05,t_reac:0,dist_disp:null}, ESTRES: {v0:6.5,a:0.6,b_arrastre:0.05,h:0.5,t_reac:1.5,dist_disp:12},
       MAL_CONDICIONADO: {v0:5,a:1,b_arrastre:0,h:2.5,t_reac:0,dist_disp:null} },
  2: { NORMAL: {D0:0.10,alpha:0.02,beta:0.001,Dumbral:1,retraso:0,tol:1e-10,maxit:20000, ...mk(matNorm(4),[1,2,3,4])},
       ESTRES: {D0:0.10,alpha:0.022,beta:0.003,Dumbral:1,retraso:6,tol:1e-10,maxit:20000, ...mk(matEst(10),[1,2,3,4,5,6,7,8,9,10])},
       MAL_CONDICIONADO: {D0:0.10,alpha:0.02,beta:0.001,Dumbral:1,retraso:0,tol:1e-10,maxit:200000, ...mk(matHil(5),[1,1,1,1,1])} },
  3: { NORMAL: {m:1,c:0.4,k:4,x0:0.1,v0:0,F0:0,w:2,h:0.01,T:20}, ESTRES: {m:1,c:0.2,k:4,x0:0.1,v0:0,F0:1,w:2,h:0.1,T:40},
       MAL_CONDICIONADO: {m:1,c:4,k:4,x0:0.1,v0:0,F0:0,w:2,h:0.01,T:20} },
  4: { NORMAL: {funcion:"sin",a:0,b:6.283185,n:9,sigma:0,seed:1,ocultos:3}, ESTRES: {funcion:"sin",a:0,b:6.283185,n:15,sigma:0.05,seed:1,ocultos:3},
       MAL_CONDICIONADO: {funcion:"exp",a:0,b:5,n:20,sigma:0.001,seed:1,ocultos:3} }
};
/* ---------- Validación ---------- */
function choleskyOk(A) {
  const n = A.length, L = Array.from({length:n},()=>new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (s <= 0) return false; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  return true;
}
function validar(caso, tipo, nombre, p) {
  const e = [];
  if (!["NORMAL","ESTRES","MAL_CONDICIONADO"].includes(tipo)) e.push("Escenario inválido.");
  if (!String(nombre == null ? "" : nombre).trim()) e.push("El nombre es obligatorio.");
  for (const f of CAMPOS[caso]) {
    let v = p[f.k];
    if (v === null || v === undefined || v === "") { if (f.opt) { p[f.k] = null; continue; } e.push(`${f.label}: es obligatorio.`); continue; }
    v = Number(v);
    if (typeof p[f.k] === "boolean" || Number.isNaN(v)) { e.push(`${f.label}: debe ser un número.`); continue; }
    if (!Number.isFinite(v)) { e.push(`${f.label}: valor no finito.`); continue; }
    if ((f.strict && v <= f.min) || (!f.strict && v < f.min) || v > f.max) e.push(`${f.label}: debe estar en ${f.strict ? "(" : "["}${f.min}, ${f.max}].`);
    p[f.k] = v;
  }
  if (caso === 4 && !["sin","exp"].includes(p.funcion)) e.push("Función: elija sin o exp.");
  if (e.length) return e;
  if (caso === 2) {
    if (p.Dumbral <= p.D0) e.push("El umbral D* debe ser mayor que D₀.");
    if (p.alpha + p.beta <= 0) e.push("α y β no pueden ser ambos 0 (nunca se alcanzaría el umbral).");
    try {
      const A = p.A.map(r => r.map(Number)), b = p.b.map(Number), n = b.length;
      if (A.flat().concat(b).some(x => !Number.isFinite(x))) throw new Error("nan");
      if (n < 4 || n > 30 || A.length !== n || A.some(r => r.length !== n)) e.push("A debe ser cuadrada (4 ≤ n ≤ 30) y b del mismo tamaño.");
      else if (A.some((r, i) => r.some((x, j) => Math.abs(x - A[j][i]) > 1e-9 * Math.max(1, Math.abs(x))))) e.push("A debe ser simétrica (gradiente conjugado exige SPD).");
      else if (!choleskyOk(A)) e.push("A no es definida positiva (SPD).");
      else { p.A = A; p.b = b; }
    } catch (_) { e.push("A y b deben ser matrices/vectores numéricos."); }
  }
  if (caso === 4 && p.b <= p.a) e.push("El fin del intervalo debe ser mayor que el inicio.");
  if (caso === 4 && p.ocultos > p.n - 3) e.push("Demasiados puntos ocultos para ese número de nodos.");
  if (caso === 3 && p.T / p.h > 2e5) e.push("T/h excede 200000 pasos.");
  if (caso === 1 && p.h < 1e-5) e.push("h demasiado pequeño (mín. 1e-5).");
  return e;
}
/* ---------- Álgebra lineal ---------- */
const vd = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0), nr = a => Math.sqrt(vd(a, a)), mv = (A, x) => A.map(r => vd(r, x));
function gsolve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = 0; for (let j = i + 1; j < n; j++) s += M[i][j] * x[j]; x[i] = (M[i][n] - s) / M[i][i]; }
  return x;
}
function eigsym(A) {
  const n = A.length, a = A.map(r => r.slice());
  for (let it = 0; it < 80; it++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-28) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    }
  }
  return a.map((r, i) => r[i]).sort((x, y) => x - y);
}
const rres = (A, x, b) => nr(A.map((r, i) => b[i] - vd(r, x)));
function iterativo(kind, A, b, tol, mx) {
  const n = b.length, nb = nr(b), R = [], X = []; let x = new Array(n).fill(0), ok = false, r, pv, rs;
  if (kind === "CG") { r = b.slice(); pv = r.slice(); rs = vd(r, r); }
  for (let k = 1; k <= mx; k++) {
    if (kind === "JACOBI") x = A.map((row, i) => { let s = 0; for (let j = 0; j < n; j++) if (j !== i) s += row[j] * x[j]; return (b[i] - s) / row[i]; });
    else if (kind === "GAUSS_SEIDEL") { for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) if (j !== i) s += A[i][j] * x[j]; x[i] = (b[i] - s) / A[i][i]; } }
    else { const Ap = mv(A, pv), al = rs / vd(pv, Ap); x = x.map((v, i) => v + al * pv[i]); r = r.map((v, i) => v - al * Ap[i]); const rn = vd(r, r); pv = r.map((v, i) => v + (rn / rs) * pv[i]); rs = rn; }
    const res = rres(A, x, b); R.push(res); X.push(k <= 300 ? x.slice() : null);
    if (!Number.isFinite(res) || res > 1e100) break;
    if (res < tol * nb) { ok = true; break; }
  }
  if (R.length && X[R.length - 1] === null) X[R.length - 1] = x.slice();
  return { x, R, X, ok };
}
function luSolve(A, b) {
  const n = b.length, L = Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0)), U = A.map(r => r.slice());
  for (let k = 0; k < n - 1; k++) for (let i = k + 1; i < n; i++) { L[i][k] = U[i][k] / U[k][k]; for (let j = k; j < n; j++) U[i][j] -= L[i][k] * U[k][j]; }
  const y = new Array(n).fill(0), x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < i; j++) s += L[i][j] * y[j]; y[i] = b[i] - s; }
  for (let i = n - 1; i >= 0; i--) { let s = 0; for (let j = i + 1; j < n; j++) s += U[i][j] * x[j]; x[i] = (y[i] - s) / U[i][i]; }
  return x;
}
const errs = (x, xr) => { const ea = nr(x.map((v, i) => v - xr[i])), n = nr(xr); return [ea, n > 0 ? ea / n : null]; };
const relerr = (e, ref) => (ref !== null && ref !== undefined && Math.abs(ref) > 0) ? e / Math.abs(ref) : null;
const allFinite = v => v.every(Number.isFinite);
/* ---------- Raíces ---------- */
function raices(p) {
  const { D0, alpha: al, beta: be, Dumbral: Du } = p, f = t => D0 + al * t + be * t * t - Du, df = t => al + 2 * be * t;
  const tref = be < 1e-15 ? (Du - D0) / al : (-al + Math.sqrt(al * al + 4 * be * (Du - D0))) / (2 * be);
  let T = 1; while (f(T) < 0 && T < 1e7) T *= 2;
  const tol = p.tol, mx = Math.floor(p.maxit), out = {};
  let a = 0, b = T, it = [];
  for (let k = 1; k <= mx; k++) { const c = (a + b) / 2; it.push([c, Math.abs(f(c))]); if (f(a) * f(c) <= 0) b = c; else a = c; if ((b - a) / 2 < tol) break; }
  out.BISECCION = [it, (b - a) / 2 < tol, { a: 0, b: T }];
  let x = T, okn = false; it = [];
  for (let k = 1; k <= mx; k++) { const d = df(x); if (Math.abs(d) < 1e-300) break; x = x - f(x) / d; it.push([x, Math.abs(f(x))]); if (Math.abs(f(x)) < tol) { okn = true; break; } }
  out.NEWTON = [it, okn, { x0: T }];
  let x0 = 0, x1 = T, oks = false; it = [];
  for (let k = 1; k <= mx; k++) { const f0 = f(x0), f1 = f(x1); if (f1 === f0) break; const x2 = x1 - f1 * (x1 - x0) / (f1 - f0); x0 = x1; x1 = x2; it.push([x2, Math.abs(f(x2))]); if (Math.abs(f(x2)) < tol) { oks = true; break; } }
  out.SECANTE = [it, oks, { x0: 0, x1: T }];
  return [tref, out];
}
/* ---------- Runge-Kutta ---------- */
function rk(order, f, y, t, h) {
  const add = (y, k, s) => y.map((yi, i) => yi + s * k[i]);
  if (order === 2) { const k2 = f(t + h / 2, add(y, f(t, y), h / 2)); return add(y, k2, h); }
  const k1 = f(t, y), k2 = f(t + h / 2, add(y, k1, h / 2)), k3 = f(t + h / 2, add(y, k2, h / 2)), k4 = f(t + h, add(y, k3, h));
  return y.map((yi, i) => yi + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
function detRef(p) {
  const { v0, a, b_arrastre: b } = p;
  if (b < 1e-12) return [v0 / a, t => v0 * t - a * t * t / 2];
  return [Math.log(1 + b * v0 / a) / b, t => (v0 + a / b) * (1 - Math.exp(-b * t)) / b - a * t / b];
}
function rkRun(order, p, h) {
  const { a, b_arrastre: b } = p, [td, xf] = detRef(p), f = (t, y) => [y[1], -(a + b * y[1])];
  let t = 0, y = [0, p.v0], k = 0; const rows = [[0, 0, y[0], y[1], 0]];
  while (t < td - 1e-12) { const hh = Math.min(h, td - t); y = rk(order, f, y, t, hh); t += hh; k++; rows.push([k, t, y[0], y[1], Math.abs(y[0] - xf(t))]); }
  return [y, rows, xf, td];
}
/* ---------- Formato de texto ---------- */
const fmt = x => x === null || x === undefined ? "n/d" : x.toExponential(3).replace(/e([+-])(\d)$/, "e$10$2");
const g = (x, n = 6) => String(Number(x.toPrecision(n)));
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const EJ = (metodo, tolerancia, paso, max_iter, convergio, tiempo_ms, iteraciones, referencia, valor, error) =>
  ({ metodo, tolerancia, paso, max_iter, convergio, tiempo_ms, iteraciones, resumen: { referencia, valor, error } });
/* ---------- Cálculo por caso: devuelve las ejecuciones a guardar ---------- */
function calcular(caso, p) {
  const ejecuciones = []; const concl = { numerica: "", problema: "" };
  if (caso === 1) {
    const [td, xf] = detRef(p), dref = xf(td), dtot = dref + p.v0 * p.t_reac, ttot = td + p.t_reac, res = {};
    for (const [order, nm] of [[2, "RK2_PUNTO_MEDIO"], [4, "RK4"]]) {
      const t0 = now(), [y, rows] = rkRun(order, p, p.h), ms = now() - t0, step = Math.max(1, Math.floor(rows.length / 300));
      const sel = rows.filter((r, i) => i % step === 0 || i === rows.length - 1);
      const its = sel.map(r => ({ numero: r[0], aproximacion: [r[1], r[2], r[3]], residual: null, error_abs: r[4], error_rel: relerr(r[4], xf(r[1])) }));
      const ex = Math.abs(y[0] - dref), ev = Math.abs(y[1]), tab = [];
      for (const h of [p.h, p.h / 2, p.h / 4, p.h / 8]) { const yy = rkRun(order, p, h)[0]; tab.push([h, Math.abs(yy[0] - dref)]); }
      const ordp = [0, 1, 2].map(i => (tab[i][1] > 1e-13 && tab[i + 1][1] > 1e-13) ? Math.log2(tab[i][1] / tab[i + 1][1]) : null);
      ejecuciones.push(EJ(nm, null, p.h, rows.length - 1, true, ms, its, `analítica: t_det=${g(td, 10)}, d_frenado=${g(dref, 10)}`,
        { x_final: y[0], v_final: y[1], refinamiento: tab, orden_estimado: ordp }, { error_abs_x: ex, error_rel_x: relerr(ex, dref), error_abs_v: ev }));
      res[nm] = [ex, ordp];
    }
    const marg = p.dist_disp === null || p.dist_disp === undefined ? null : p.dist_disp - dtot;
    ejecuciones.push(EJ("REFERENCIA_ANALITICA", null, null, null, true, 0, [], "v(t), x(t) en forma cerrada", { t_det: td, d_frenado: dref, d_total_con_reaccion: dtot, t_total: ttot, margen: marg }, {}));
    const ro = o => o.filter(v => v).map(v => Math.round(v * 100) / 100);
    concl.numerica = `Error en la distancia final: RK2 = ${fmt(res.RK2_PUNTO_MEDIO[0])}, RK4 = ${fmt(res.RK4[0])} (paso h = ${p.h}). ` +
      (p.b_arrastre < 1e-12 ? "Con desaceleración constante la solución es un polinomio de grado 2 y ambos métodos son prácticamente exactos; use b > 0 para ver la diferencia de orden. "
        : `Orden estimado al refinar h: RK2 ≈ [${ro(res.RK2_PUNTO_MEDIO[1]).join(", ")}], RK4 ≈ [${ro(res.RK4[1]).join(", ")}]. `) +
      "Las integrales por trapecio, Simpson y Romberg y las raíces se añaden en la Semana 2.";
    concl.problema = `Con v₀ = ${p.v0} m/s el tiempo de detención es ${td.toFixed(3)} s y la distancia de frenado ${dref.toFixed(3)} m; con ${p.t_reac} s de reacción la distancia total es ${dtot.toFixed(3)} m en ${ttot.toFixed(3)} s. ` +
      (marg === null ? "No se indicó distancia disponible. " : (marg >= 0 ? `Quedan ${marg.toFixed(2)} m de margen sobre la distancia disponible. ` : `Se excede la distancia disponible por ${(-marg).toFixed(2)} m. `)) +
      "Modelo hipotético con datos sintéticos: no permite inferir el comportamiento de un sistema real.";
  } else if (caso === 2) {
    const [tref, rt] = raices(p), A = p.A, b = p.b, D = t => p.D0 + p.alpha * t + p.beta * t * t, txt = [];
    for (const [nm, [it, ok, extra]] of Object.entries(rt)) {
      const its = it.slice(0, 300).map((r, i) => ({ numero: i + 1, aproximacion: [r[0]], residual: r[1], error_abs: Math.abs(r[0] - tref), error_rel: relerr(Math.abs(r[0] - tref), tref) }));
      const last = it.length ? it[it.length - 1][0] : null, ea = last !== null ? Math.abs(last - tref) : null;
      ejecuciones.push(EJ(nm, p.tol, null, Math.floor(p.maxit), ok, 0, its, `analítica t*=${g(tref, 12)} meses`, { t_estimado: last, iteraciones: it.length, ...extra }, { error_abs: ea, error_rel: ea !== null ? relerr(ea, tref) : null }));
      txt.push(`${nm.charAt(0) + nm.slice(1).toLowerCase()}: ${it.length} it., error ${fmt(ea)}`);
    }
    const lam = eigsym(A), kap = lam[lam.length - 1] / lam[0], xr = gsolve(A, b), lin = {};
    for (const kind of ["JACOBI", "GAUSS_SEIDEL", "CG", "LU"]) {
      const t0 = now(); let x, R, X, ok;
      if (kind === "LU") { x = luSolve(A, b); R = [rres(A, x, b)]; X = [x]; ok = true; } else ({ x, R, X, ok } = iterativo(kind, A, b, p.tol, Math.floor(p.maxit)));
      const ms = now() - t0, [ea, er] = allFinite(x) ? errs(x, xr) : [null, null];
      let rows = [];
      for (let k = 0; k < R.length; k++) if (X[k] !== null && allFinite(X[k])) { const e2 = errs(X[k], xr); rows.push({ numero: k + 1, aproximacion: X[k], residual: R[k], error_abs: e2[0], error_rel: e2[1] }); }
      if (!rows.length) rows = [{ numero: 0, aproximacion: [null], residual: null, error_abs: null, error_rel: null }];
      ejecuciones.push(EJ(kind, p.tol, null, Math.floor(p.maxit), ok, ms, rows, "solución directa (eliminación con pivoteo)",
        { x: (ok || kind === "LU") ? x : null, iteraciones: R.length, kappa2: kap }, { error_abs: ea, error_rel: er, residual: R.length ? R[R.length - 1] : null }));
      lin[kind] = [ok, R.length];
    }
    const dr = D(tref + p.retraso), den = p.alpha + 2 * p.beta * tref, sens = den ? -tref / den : null;
    ejecuciones.push(EJ("REFERENCIA_ANALITICA", null, null, null, true, 0, [], "raíz positiva de la cuadrática", { t_umbral: tref, D_en_t_mas_retraso: dr, dt_dalpha: sens, kappa2: kap }, {}));
    const nc = Object.entries(lin).filter(([, v]) => !v[0]).map(([k]) => k);
    concl.numerica = "Raíces — " + txt.join("; ") + `. Sistema lineal (n=${b.length}, κ₂≈${kap.toPrecision(3)}): ` +
      Object.entries(lin).map(([k, v]) => `${k}: ${v[0] ? "sí" : "NO"} converge, ${v[1]} it.`).join(", ") + ". " +
      (nc.length ? `No convergen: ${nc.join(", ")} (fallo de convergencia, p. ej. ρ(B_J) ≥ 1, distinto del mal condicionamiento). ` : "") +
      (kap > 1e4 ? `κ elevado: el residuo pequeño no garantiza error pequeño; pérdida ≈ ${Math.log10(kap).toFixed(1)} cifras.` : "Sistema bien condicionado.");
    concl.problema = `El indicador alcanza el umbral D* = ${p.Dumbral.toFixed(1)} en t* ≈ ${tref.toFixed(2)} meses. ` +
      (p.retraso > 0 ? `Si el mantenimiento se retrasa ${g(p.retraso)} meses, D(t*+retraso) = ${dr.toFixed(3)} (excede el umbral). ` : "") +
      (sens ? `Sensibilidad: ∂t*/∂α ≈ ${sens.toFixed(2)} meses por unidad de α. ` : "") +
      "Los coeficientes calibrados con un sistema mal condicionado propagan error a t*. Indicador hipotético: no es una predicción de fallas reales.";
  } else if (caso === 3) {
    const { m, c, k, F0, w } = p, w0 = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m)), wd = w0 * Math.sqrt(Math.max(0, 1 - z * z));
    const reg = z < 1 - 1e-9 ? "subamortiguado" : (Math.abs(z - 1) <= 1e-9 ? "crítico" : "sobreamortiguado");
    const amp = F0 > 0 ? F0 / Math.sqrt((k - m * w * w) ** 2 + (c * w) ** 2) : null;
    ejecuciones.push(EJ("REFERENCIA_ANALITICA", null, null, null, true, 0, [], "oscilador lineal de 1 g.d.l.",
      { omega0: w0, zeta: z, omega_d: z < 1 ? wd : null, periodo_d: wd > 0 ? 2 * Math.PI / wd : null, regimen: reg, amplitud_estacionaria: amp }, {}));
    concl.numerica = "Los métodos RK2/RK4 y la integración de x(t)² (trapecio, Simpson, Romberg) se ejecutan en la Semana 3. Por ahora se calculan los parámetros analíticos de referencia.";
    concl.problema = `ω₀ = ${w0.toFixed(4)} rad/s, ζ = ${z.toFixed(4)} → régimen ${reg}. ` + (amp ? `Amplitud estacionaria bajo F₀ sinusoidal: ${g(amp, 4)} m. ` : "Sin fuerza externa (vibración libre). ") +
      (Math.abs(z - 1) < 0.05 ? "ζ ≈ 1: raíces características casi iguales; sensibilidad alta a (c,k). " : "") + "Modelo lineal hipotético: no incluye no linealidades ni efectos reales del viento.";
  } else throw new Error("La ejecución numérica del módulo Sensores (interpolación) se implementa en la Semana 2.");
  return { ejecuciones, conclusiones: concl };
}
/* ---------- Reproducibilidad: diferencia máxima entre dos corridas ---------- */
const scal = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));
function comparar(anterior, nuevas) {   // anterior: {metodo:{valor}} ; nuevas: ejecuciones[]
  const out = {};
  for (const e of nuevas) {
    if (!anterior[e.metodo]) continue;
    const a = scal(anterior[e.metodo].valor), b = scal(e.resumen.valor), ks = Object.keys(a).filter(k => k in b);
    out[e.metodo] = ks.length ? Math.max(...ks.map(k => Math.abs(a[k] - b[k]))) : 0;
  }
  return out;
}
const API = { CAMPOS, PRESETS, validar, calcular, comparar, relerr };
if (typeof module !== "undefined" && module.exports) module.exports = API; else root.SimCalc = API;
})(typeof window !== "undefined" ? window : globalThis);
