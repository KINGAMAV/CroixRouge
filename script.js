

// CROIX-ROUGE CÔTE D'IVOIRE - GESTION DES INFRASTRUCTURES

// ======= DÉPÔT DE DONNÉES (BASE DE DONNÉES fictives) =======
// Stocke les utilisateurs, produits, mouvements, régions et logs d'activité
let db = {
  users: [
    { id:'u001', username:'admin', password:'Admin@2024', fullname:'Administrateur Général', role:'Directeur', level:4, active:true, lastLogin:null },
    { id:'u002', username:'gestionnaire', password:'Gest@2024', fullname:'Mamadou Koné', role:'Gestionnaire de Stock', level:3, active:true, lastLogin:null },
    { id:'u003', username:'operateur', password:'Oper@2024', fullname:'Aïssatou Diallo', role:'Opératrice de terrain', level:2, active:true, lastLogin:null },
    { id:'u004', username:'observateur', password:'Obs@2024', fullname:'Yao N\'Guessan', role:'Observateur', level:1, active:true, lastLogin:null }
  ],
  products: [],
  movements: [],
  regions: [
    { id:'r001', name:'Abidjan', zone:'Grand Abidjan', contact:'Kofi Asante' },
    { id:'r002', name:'Bouaké', zone:'Centre', contact:'Aminata Bamba' },
    { id:'r003', name:'Yamoussoukro', zone:'Centre', contact:'Paul Yao' },
    { id:'r004', name:'San-Pédro', zone:'Sud', contact:'Marie Coulibaly' },
    { id:'r005', name:'Korhogo', zone:'Nord', contact:'Ibrahim Traoré' }
  ],
  activityLog: [],
  productCounter: 1,
  movementCounter: 1
};

// Variable globale pour stocker l'utilisateur actuellement connecté
let currentUser = null;
// Variable pour suivre l'ID de l'élément en cours de modification
let editingId = null;

// PERSISTANCE DES DONNÉES 
// Charge les données depuis le localStorage au démarrage de l'application
function loadDB() {
  const saved = localStorage.getItem('croixrouge_ci_db');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      db = { ...db, ...parsed };
    } catch(e) {}
  }
}

function saveDB() {
  localStorage.setItem('croixrouge_ci_db', JSON.stringify(db));
}

// FONCTIONS UTILITAIRES (HELPERS)
// Fonctions génériques pour générer des IDs, formater les dates, etc.

// Génère un ID unique pour un nouveau produit (format: PRD-0001)
function genProductId() {
  const id = 'PRD-' + String(db.productCounter).padStart(4,'0');
  db.productCounter++;
  return id;
}

function genMovementId(type) {
  const prefix = type === 'entry' ? 'ENT' : 'SOR';
  const id = prefix + '-' + String(db.movementCounter).padStart(5,'0');
  db.movementCounter++;
  return id;
}

function genId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.floor(Math.random()*1000);
}

function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
}

function fmtDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' ' +
         date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function toast(msg, type='success') {
  const tc = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = {success:'✅', error:'❌', warning:'⚠️'};
  t.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  tc.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(60px)'; setTimeout(()=>t.remove(),300); }, 3500);
}

function logActivity(action, details) {
  if (!currentUser) return;
  db.activityLog.unshift({
    id: genId('log'),
    userId: currentUser.id,
    username: currentUser.username,
    fullname: currentUser.fullname,
    action,
    details,
    timestamp: new Date().toISOString()
  });
  if (db.activityLog.length > 500) db.activityLog = db.activityLog.slice(0, 500);
  saveDB();
}

// FONCTIONS DE RECHERCHE 
// Permet de trouver un produit ou une région par son ID
function getProduct(id) { return db.products.find(p=>p.id===id); }
function getRegion(id) { return db.regions.find(r=>r.id===id); }

// CALCUL DU STOCK
// Calcule le stock actuel d'un produit (entrées - sorties)
function getStockForProduct(pid) {
  const p = getProduct(pid);
  if (!p) return {cartons:0, packs:0, totalPacks:0};
  let entryPacks = 0, exitPacks = 0;
  const ppp = p.packPerCarton || 0;
  db.movements.filter(m=>m.productId===pid).forEach(m=>{
    const totalPacks = (m.qtyCartons||0)*(ppp||1) + (m.qtyPacks||0);
    if (m.type==='entry') entryPacks += totalPacks;
    else exitPacks += totalPacks;
  });
  const net = entryPacks - exitPacks;
  const cartons = ppp > 0 ? Math.floor(net/ppp) : net;
  const packs = ppp > 0 ? net % ppp : 0;
  return { cartons, packs, totalPacks: net, entryPacks, exitPacks };
}

// Vérifie le statut d'expiration d'un produit (expiré, proche, OK)
function getExpiryStatus(expiryDate) {
  if (!expiryDate) return 'none';
  const exp = new Date(expiryDate);
  const now = new Date();
  const diffDays = Math.floor((exp - now) / (1000*60*60*24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 90) return 'near';
  return 'good';
}

// Retourne le libellé du niveau d'accès utilisateur
function levelLabel(l) {
  const labels = {1:'Observateur',2:'Opérateur',3:'Gestionnaire',4:'Administrateur'};
  return labels[l] || 'Inconnu';
}

//AUTHENTIFICATION
// Gestion de la connexion et déconnexion des utilisateurs

// Authentifie l'utilisateur avec son nom d'utilisateur et mot de passe
function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const user = db.users.find(x=>x.username===u && x.password===p && x.active);
  if (!user) {
    document.getElementById('loginError').style.display='block';
    return;
  }
  currentUser = user;
  user.lastLogin = new Date().toISOString();
  saveDB();
  logActivity('login', `Connexion réussie depuis l'interface web`);
  document.getElementById('loginPage').style.display='none';
  document.getElementById('app').classList.add('active');
  initApp();
}

document.getElementById('loginPass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
document.getElementById('loginUser').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('loginPass').focus(); });

// Déconnecte l'utilisateur et retourne à la page de connexion
function doLogout() {
  logActivity('logout', 'Déconnexion de l\'application');
  currentUser = null;
  document.getElementById('app').classList.remove('active');
  document.getElementById('loginPage').style.display='flex';
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
  document.getElementById('loginError').style.display='none';
}

// ======= INITIALISATION DE L'APPLICATION =======
// Configure l'interface utilisateur après la connexion
// Affiche les informations utilisateur et gère les permissions d'accès
function initApp() {
  // Set user info
  document.getElementById('userAvatar').textContent = currentUser.fullname.charAt(0).toUpperCase();
  document.getElementById('userDisplayName').textContent = currentUser.fullname;
  document.getElementById('userDisplayLevel').textContent = `Niveau ${currentUser.level} — ${levelLabel(currentUser.level)}`;
  document.getElementById('welcomeName').textContent = currentUser.fullname.split(' ')[0];

  // Access control
  const lvl = currentUser.level;
  document.getElementById('navAdminSection').style.display = lvl >= 3 ? 'block' : 'none';
  document.getElementById('navUsers').style.display = lvl >= 3 ? 'flex' : 'none';
  document.getElementById('navActivity').style.display = lvl >= 4 ? 'flex' : 'none';
  
  // Level 1: read only
  document.getElementById('btnAddProduct').style.display = lvl >= 3 ? 'flex' : 'none';
  document.getElementById('btnAddEntry').style.display = lvl >= 2 ? 'flex' : 'none';
  document.getElementById('btnAddExit').style.display = lvl >= 2 ? 'flex' : 'none';
  document.getElementById('btnAddRegion').style.display = lvl >= 3 ? 'flex' : 'none';
  document.getElementById('addUserBtn').style.display = lvl >= 4 ? 'flex' : 'none';

  // Set default dates
  document.getElementById('entryDate').value = today();
  document.getElementById('exitDate').value = today();

  // Clock
  updateClock();
  setInterval(updateClock, 60000);

  showPage('dashboard');
  renderDashboard();
  renderProducts();
  renderEntries();
  renderExits();
  renderStock();
  renderRegions();
  renderUsers();
  renderActivityLog();
  renderReports();
  updateAlertBadge();
}

// Met à jour l'horloge dans la barre supérieure
function updateClock() {
  const now = new Date();
  document.getElementById('topbarTime').textContent = now.toLocaleString('fr-FR',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}

// ======= NAVIGATION =======
// Gestion du changement de pages dans l'application
// Vérifie les permissions d'accès avant d'afficher une page
function showPage(page) {
  // Access check
  const lvl = currentUser ? currentUser.level : 0;
  if ((page==='users' || page==='activity') && lvl < 3) { toast('Accès non autorisé','error'); return; }
  if (page==='activity' && lvl < 4) { toast('Accès réservé aux administrateurs','error'); return; }

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(page+'Page').classList.add('active');
  
  // Refresh
  if (page==='dashboard') renderDashboard();
  if (page==='reports') renderReports();
  if (page==='stock') renderStock();
  if (page==='users') renderUsers();
  if (page==='activity') renderActivityLog();
  if (page==='regions') renderRegions();

  // Mark active nav
  document.querySelectorAll('.nav-item').forEach(n=>{
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes(`'${page}'`)) n.classList.add('active');
  });
}

// GESTION DES FENÊTRES MODALES
// Ouvre et ferme les fenêtres de dialogue (ajout/modification de données)

// Ouvre une fenêtre modale et initialise les champs si nécessaire
function openModal(id) {
  document.getElementById(id).classList.add('active');
  if (id==='entryModal' || id==='exitModal') {
    populateProductSelects();
    populateRegionSelects();
  }
  if (id==='productModal') {
    document.getElementById('productModalTitle').textContent = '📦 Nouveau produit';
    document.getElementById('editProductId').value='';
    ['pName','pCategory','pUnit','pLongevity','pWeight','pPackPerCarton','pUnitPerPack','pDescription'].forEach(f=>{
      const el=document.getElementById(f); if(el){el.value=''; if(el.tagName==='SELECT') el.selectedIndex=0;}
    });
    document.getElementById('cartonPreview').style.display='none';
  }
  if (id==='userModal') {
    document.getElementById('userModalTitle').textContent = '👤 Nouvel utilisateur';
    document.getElementById('editUserId').value='';
    ['uUsername','uFullname','uPassword','uRole'].forEach(f=>document.getElementById(f).value='');
    document.getElementById('uLevel').value='2';
  }
  if (id==='regionModal') {
    document.getElementById('editRegionId').value='';
    ['rName','rContact'].forEach(f=>document.getElementById(f).value='');
    document.getElementById('rZone').selectedIndex=0;
  }
}

// Ferme une fenêtre modale
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Permet de fermer une modale en cliquant à l'extérieur
document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click', e=>{ if(e.target===o) o.classList.remove('active'); });
});

// ======= GESTION DES PRODUITS =======
// Fonctions pour créer, modifier, supprimer et afficher les produits

// Met à jour l'aperçu du conditionnement (cartons/paquets) dans le formulaire produit
function updateCartonPreview() {
  const ppc = parseInt(document.getElementById('pPackPerCarton').value)||0;
  const upp = document.getElementById('pUnitPerPack').value||'';
  const preview = document.getElementById('cartonPreview');
  const box = document.getElementById('cartonInfoBox');
  if (ppc > 0) {
    preview.style.display='block';
    box.innerHTML = `
      <div class="ci-item"><span class="ci-label">1 Carton =</span><span class="ci-value">${ppc} paquets</span></div>
      ${upp ? `<div class="ci-item"><span class="ci-label">1 Paquet =</span><span class="ci-value">${upp}</span></div>` : ''}
      <div class="ci-item"><span class="ci-label">1 Carton contient</span><span class="ci-value">${ppc} × ${upp||'?'}</span></div>`;
  } else {
    preview.style.display='none';
  }
}

// Enregistre un nouveau produit ou met à jour un produit existant
function saveProduct() {
  const name = document.getElementById('pName').value.trim();
  const cat = document.getElementById('pCategory').value;
  const unit = document.getElementById('pUnit').value;
  const longevity = parseInt(document.getElementById('pLongevity').value)||0;
  const weight = document.getElementById('pWeight').value.trim();
  const packPerCarton = parseInt(document.getElementById('pPackPerCarton').value)||0;
  const unitPerPack = document.getElementById('pUnitPerPack').value.trim();
  const description = document.getElementById('pDescription').value.trim();
  if (!name || !cat || !unit || !longevity || !weight || !packPerCarton || !unitPerPack || !description) { toast('Veuillez remplir les champs obligatoires','error'); return; }
  
  const editId = document.getElementById('editProductId').value;
  if (editId) {
    const p = db.products.find(x=>x.id===editId);
    if (p) {
      p.name=name; p.category=cat; p.unit=unit;
      p.longevity=parseInt(document.getElementById('pLongevity').value)||0;
      p.weight=document.getElementById('pWeight').value;
      p.packPerCarton=parseInt(document.getElementById('pPackPerCarton').value)||0;
      p.unitPerPack=document.getElementById('pUnitPerPack').value;
      p.description=document.getElementById('pDescription').value;
      logActivity('edit', `Modification du produit ${p.code} — ${p.name}`);
      toast('Produit mis à jour avec succès');
    }
  } else {
    const p = {
      id: genId('p'), code: genProductId(), name, category:cat, unit,
      longevity: parseInt(document.getElementById('pLongevity').value)||0,
      weight: document.getElementById('pWeight').value,
      packPerCarton: parseInt(document.getElementById('pPackPerCarton').value)||0,
      unitPerPack: document.getElementById('pUnitPerPack').value,
      description: document.getElementById('pDescription').value,
      createdAt: today()
    };
    db.products.push(p);
    logActivity('create', `Ajout du produit ${p.code} — ${p.name}`);
    toast('Produit enregistré avec succès ✅');
  }
  saveDB();
  closeModal('productModal');
  renderProducts();
}

// Ouvre le formulaire de modification d'un produit existant
function editProduct(id) {
  if (currentUser.level < 3) { toast('Accès non autorisé','error'); return; }
  const p = db.products.find(x=>x.id===id);
  if (!p) return;
  document.getElementById('editProductId').value = p.id;
  document.getElementById('productModalTitle').textContent = '✏️ Modifier le produit';
  document.getElementById('pName').value = p.name;
  document.getElementById('pCategory').value = p.category;
  document.getElementById('pUnit').value = p.unit;
  document.getElementById('pLongevity').value = p.longevity||'';
  document.getElementById('pWeight').value = p.weight||'';
  document.getElementById('pPackPerCarton').value = p.packPerCarton||'';
  document.getElementById('pUnitPerPack').value = p.unitPerPack||'';
  document.getElementById('pDescription').value = p.description||'';
  updateCartonPreview();
  openModal('productModal');
}

// Supprime un produit après confirmation
function deleteProduct(id) {
  if (currentUser.level < 3) { toast('Accès non autorisé','error'); return; }
  const p = db.products.find(x=>x.id===id);
  if (!p) return;
  document.getElementById('confirmText').textContent = `Supprimer le produit "${p.name}" (${p.code}) ?`;
  document.getElementById('confirmBtn').onclick = ()=>{
    db.products = db.products.filter(x=>x.id!==id);
    logActivity('delete', `Suppression du produit ${p.code} — ${p.name}`);
    saveDB(); renderProducts(); closeModal('confirmModal'); toast('Produit supprimé');
  };
  openModal('confirmModal');
}

// Affiche la liste des produits dans le tableau
function renderProducts() {
  const tbody = document.getElementById('productsTbody');
  if (!tbody) return;
  if (db.products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><h4>Aucun produit enregistré</h4><p>Commencez par ajouter votre premier produit</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = db.products.map(p=>{
    const stock = getStockForProduct(p.id);
    const low = stock.totalPacks === 0;
    return `<tr>
      <td><span class="id-badge">${p.code}</span></td>
      <td><strong>${p.name}</strong>${p.description?`<br><small style="color:var(--text-muted)">${p.description.substring(0,50)}${p.description.length>50?'...':''}</small>`:''}</td>
      <td><span style="background:var(--bg2);padding:3px 8px;border-radius:6px;font-size:12px">${p.category}</span></td>
      <td>${p.unit}</td>
      <td>${p.packPerCarton>0?`<span style="background:var(--gold-light);color:var(--warning);padding:3px 8px;border-radius:6px;font-size:12px">📦 ${p.packPerCarton} paquets/carton</span>`:'<span style="color:var(--text-muted);font-size:12px">Sans carton</span>'}</td>
      <td>${p.packPerCarton>0 ? `${stock.cartons} cartons + ${stock.packs} paquets` : `${stock.totalPacks} ${p.unit}`}</td>
      <td><span class="status-badge ${low?'status-exit':'status-active'}">${low?'Épuisé':'En stock'}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-ghost btn-icon" onclick="viewProductDetail('${p.id}')" title="Voir détails">👁️</button>
          ${currentUser.level>=3?`<button class="btn btn-sm btn-ghost btn-icon" onclick="editProduct('${p.id}')" title="Modifier">✏️</button><button class="btn btn-sm btn-ghost btn-icon" onclick="deleteProduct('${p.id}')" title="Supprimer" style="color:var(--rouge)">🗑️</button>`:''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// Affiche les détails complets d'un produit dans une fenêtre modale
function viewProductDetail(id) {
  const p = getProduct(id);
  if (!p) return;
  const stock = getStockForProduct(p.id);
  const movements = db.movements.filter(m=>m.productId===id).slice(0,10);
  document.getElementById('detailModalTitle').textContent = `📦 ${p.code} — ${p.name}`;
  document.getElementById('detailModalBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div><span style="font-size:12px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Catégorie</span><div style="font-weight:600;margin-top:4px">${p.category}</div></div>
      <div><span style="font-size:12px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Unité</span><div style="font-weight:600;margin-top:4px">${p.unit}</div></div>
      <div><span style="font-size:12px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Longévité</span><div style="font-weight:600;margin-top:4px">${p.longevity?p.longevity+' mois':'Non définie'}</div></div>
      <div><span style="font-size:12px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Conditionnement</span><div style="font-weight:600;margin-top:4px">${p.packPerCarton>0?`${p.packPerCarton} paquets/carton`:'Sans carton'}</div></div>
    </div>
    ${p.packPerCarton>0 ? `<div class="carton-info" style="margin-bottom:16px">
      <div class="ci-item"><span class="ci-label">Stock cartons</span><span class="ci-value">${stock.cartons}</span></div>
      <div class="ci-item"><span class="ci-label">Stock paquets</span><span class="ci-value">${stock.packs}</span></div>
      <div class="ci-item"><span class="ci-label">Total paquets</span><span class="ci-value">${stock.totalPacks}</span></div>
    </div>` : `<div class="carton-info" style="margin-bottom:16px">
      <div class="ci-item"><span class="ci-label">Stock actuel</span><span class="ci-value">${stock.totalPacks} ${p.unit}</span></div>
      <div class="ci-item"><span class="ci-label">Total entrées</span><span class="ci-value">${stock.entryPacks}</span></div>
      <div class="ci-item"><span class="ci-label">Total sorties</span><span class="ci-value">${stock.exitPacks}</span></div>
    </div>`}
    <h4 style="margin-bottom:10px;color:var(--navy)">10 derniers mouvements</h4>
    ${movements.length===0?'<p style="color:var(--text-muted);font-size:14px">Aucun mouvement</p>':movements.map(m=>`
      <div class="activity-item">
        <div class="activity-dot ${m.type}"></div>
        <div><div class="activity-text">${m.type==='entry'?'📥 Entrée':'📤 Sortie'} — ${m.qtyCartons||0} cartons + ${m.qtyPacks||0} paquets</div><div class="activity-meta">${fmtDate(m.date)} · ${m.createdBy||'—'}</div></div>
      </div>`).join('')}
  `;
  openModal('detailModal');
}

// ======= GESTION DES ENTRÉES (DONS REÇUS) =======
// Fonctions pour enregistrer et afficher les entrées de produits

// Remplit les listes déroulantes des produits dans les formulaires d'entrée/sortie
function populateProductSelects() {
  const selectors = ['entryProduct','exitProduct'];
  selectors.forEach(sid=>{
    const sel = document.getElementById(sid);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- Sélectionner un produit --</option>';
    db.products.forEach(p=>{
      sel.innerHTML += `<option value="${p.id}">${p.code} — ${p.name}</option>`;
    });
    if (cur) sel.value = cur;
  });
}

// Remplit la liste déroulante des régions dans le formulaire de sortie
function populateRegionSelects() {
  const sel = document.getElementById('exitRegion');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Sélectionner --</option>';
  db.regions.forEach(r=>{
    sel.innerHTML += `<option value="${r.id}">${r.name} (${r.zone})</option>`;
  });
}

// Met à jour les informations du produit sélectionné dans le formulaire d'entrée
function onEntryProductChange() {
  const pid = document.getElementById('entryProduct').value;
  const p = getProduct(pid);
  const infoDiv = document.getElementById('entryCartonInfo');
  const details = document.getElementById('entryCartonDetails');
  const totalCalc = document.getElementById('entryTotalCalc');
  if (p && p.packPerCarton > 0) {
    infoDiv.style.display='block';
    details.innerHTML = `<div class="ci-item"><span class="ci-label">Conditionnement</span><span class="ci-value">📦 ${p.packPerCarton} paquets/carton</span></div><div class="ci-item"><span class="ci-label">Unité/paquet</span><span class="ci-value">${p.unitPerPack||p.unit}</span></div>`;
    document.getElementById('entryQtyCartonLabel').textContent = 'Quantité (Cartons)';
    document.getElementById('entryQtyPackLabel').textContent = 'Paquets supplémentaires (hors carton)';
  } else {
    infoDiv.style.display='none';
    document.getElementById('entryQtyCartonLabel').textContent = p ? `Quantité (${p.unit})` : 'Quantité';
    document.getElementById('entryQtyPackLabel').textContent = 'Paquets supplémentaires';
  }
  calcTotalEntry();
}

// Calcule et affiche le total en temps réel pour une entrée
function calcTotalEntry() {
  const pid = document.getElementById('entryProduct').value;
  const p = getProduct(pid);
  const c = parseInt(document.getElementById('entryQtyCartons').value)||0;
  const pk = parseInt(document.getElementById('entryQtyPacks').value)||0;
  const div = document.getElementById('entryTotalCalc');
  if (p && (c>0||pk>0)) {
    div.style.display='block';
    if (p.packPerCarton>0) {
      const total = c*p.packPerCarton + pk;
      div.innerHTML = `✅ Total : <strong>${c} cartons × ${p.packPerCarton} paquets + ${pk} paquets = ${total} paquets</strong>`;
    } else {
      div.innerHTML = `✅ Quantité : <strong>${c+pk} ${p.unit}</strong>`;
    }
  } else div.style.display='none';
}

// Met à jour les informations du produit sélectionné dans le formulaire de sortie
function onExitProductChange() {
  const pid = document.getElementById('exitProduct').value;
  const p = getProduct(pid);
  const stock = pid ? getStockForProduct(pid) : null;
  const infoDiv = document.getElementById('exitStockInfo');
  const details = document.getElementById('exitStockDetails');
  if (p && stock) {
    infoDiv.style.display='block';
    details.innerHTML = `📊 Stock disponible : <strong>${p.packPerCarton>0 ? `${stock.cartons} cartons + ${stock.packs} paquets (${stock.totalPacks} paquets au total)` : `${stock.totalPacks} ${p.unit}`}</strong>`;
    details.style.color = stock.totalPacks===0 ? 'var(--rouge-dark)' : 'var(--success)';
    details.style.background = stock.totalPacks===0 ? 'var(--rouge-light)' : 'var(--success-light)';
    if (stock.totalPacks === 0) details.innerHTML += '<br>⚠️ Stock épuisé !';
  } else infoDiv.style.display='none';
  calcTotalExit();
}

// Calcule et affiche le total en temps réel pour une sortie
function calcTotalExit() {
  const pid = document.getElementById('exitProduct').value;
  const p = getProduct(pid);
  const c = parseInt(document.getElementById('exitQtyCartons').value)||0;
  const pk = parseInt(document.getElementById('exitQtyPacks').value)||0;
  const div = document.getElementById('exitTotalCalc');
  if (p && (c>0||pk>0)) {
    div.style.display='block';
    if (p.packPerCarton>0) {
      const total = c*p.packPerCarton + pk;
      div.innerHTML = `📤 Total sortie : <strong>${total} paquets</strong>`;
    } else {
      div.innerHTML = `📤 Quantité sortie : <strong>${c+pk} ${p.unit}</strong>`;
    }
  } else div.style.display='none';
}

// Enregistre une nouvelle entrée (don reçu) dans la base de données
function saveEntry() {
  if (currentUser.level < 2) { toast('Accès non autorisé','error'); return; }
  const pid = document.getElementById('entryProduct').value;
  const date = document.getElementById('entryDate').value;
  const qtyC = parseInt(document.getElementById('entryQtyCartons').value);
  const qtyP = parseInt(document.getElementById('entryQtyPacks').value);
  const observations = document.getElementById('entryNotes').value.trim();
  if (!pid || !date ||isNaN(qtyC) || isNaN(qtyP) || !observations ) { toast('Veuillez remplir les champs obligatoires','error'); return; }
  if (qtyC===0 && qtyP===0) { toast('La quantité doit être supérieure à 0','error'); return; }
  const p = getProduct(pid);
  const m = {
    id: genId('m'), code: genMovementId('entry'), type:'entry', productId:pid,
    date, qtyCartons:qtyC, qtyPacks:qtyP,
    donor: document.getElementById('entryDonor').value,
    batch: document.getElementById('entryBatch').value,
    expiry: document.getElementById('entryExpiry').value,
    notes: document.getElementById('entryNotes').value,
    createdBy: currentUser.username,
    createdAt: new Date().toISOString()
  };
  db.movements.push(m);
  logActivity('entry', `Entrée ${m.code} : ${qtyC} cartons + ${qtyP} paquets de "${p.name}"`);
  saveDB();
  closeModal('entryModal');
  // Reset form
  ['entryProduct','entryDonor','entryBatch','entryExpiry','entryNotes'].forEach(f=>document.getElementById(f).value='');
  document.getElementById('entryQtyCartons').value='0';
  document.getElementById('entryQtyPacks').value='0';
  document.getElementById('entryDate').value=today();
  document.getElementById('entryTotalCalc').style.display='none';
  document.getElementById('entryCartonInfo').style.display='none';
  renderEntries(); renderStock(); renderDashboard(); updateAlertBadge();
  toast(`Entrée ${m.code} enregistrée avec succès ✅`);
}

// Affiche la liste des entrées dans le tableau
function renderEntries() {
  const tbody = document.getElementById('entriesTbody');
  if (!tbody) return;
  const entries = db.movements.filter(m=>m.type==='entry').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if (entries.length===0) {
    tbody.innerHTML='<tr><td colspan="9"><div class="empty-state"><p>Aucune entrée enregistrée</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(m=>{
    const p = getProduct(m.productId);
    const expStatus = getExpiryStatus(m.expiry);
    return `<tr>
      <td><span class="id-badge">${m.code}</span></td>
      <td>${fmtDate(m.date)}</td>
      <td>${p?`<strong>${p.name}</strong><br><small style="color:var(--text-muted)">${p.code}</small>`:'—'}</td>
      <td style="text-align:center"><strong>${m.qtyCartons||0}</strong></td>
      <td style="text-align:center">${m.qtyPacks||0}</td>
      <td>${m.donor||'—'}</td>
      <td>${m.expiry?`<span class="expiry-${expStatus}">${fmtDate(m.expiry)}</span>`:'—'}</td>
      <td>${m.createdBy||'—'}</td>
      <td>
        <button class="btn btn-sm btn-ghost btn-icon" onclick="viewMovementDetail('${m.id}')" title="Détails">👁️</button>
        ${currentUser.level>=3?`<button class="btn btn-sm btn-ghost btn-icon" onclick="deleteMovement('${m.id}')" style="color:var(--rouge)" title="Supprimer">🗑️</button>`:''}
      </td>
    </tr>`;
  }).join('');
}

// ======= GESTION DES SORTIES (DISTRIBUTIONS) =======
// Fonctions pour enregistrer et afficher les sorties de produits

// Enregistre une nouvelle sortie (distribution) dans la base de données
function saveExit() {
  if (currentUser.level < 2) { toast('Accès non autorisé','error'); return; }
  const pid = document.getElementById('exitProduct').value;
  const date = document.getElementById('exitDate').value;
  const rid = document.getElementById('exitRegion').value;
  const qtyC = parseInt(document.getElementById('exitQtyCartons').value)||0;
  const qtyP = parseInt(document.getElementById('exitQtyPacks').value)||0;
  if (!pid || !date || !rid) { toast('Veuillez remplir les champs obligatoires','error'); return; }
  if (qtyC===0 && qtyP===0) { toast('La quantité doit être supérieure à 0','error'); return; }
  
  // Check stock
  const p = getProduct(pid);
  const stock = getStockForProduct(pid);
  const ppp = p.packPerCarton||1;
  const requested = qtyC*(p.packPerCarton||1) + qtyP;
  if (requested > stock.totalPacks) {
    toast(`Stock insuffisant ! Disponible: ${stock.totalPacks} — Demandé: ${requested}`,'error');
    return;
  }
  const r = getRegion(rid);
  const m = {
    id: genId('m'), code: genMovementId('exit'), type:'exit', productId:pid,
    date, qtyCartons:qtyC, qtyPacks:qtyP, regionId:rid,
    beneficiary: document.getElementById('exitBeneficiary').value,
    reason: document.getElementById('exitReason').value,
    notes: document.getElementById('exitNotes').value,
    createdBy: currentUser.username,
    createdAt: new Date().toISOString()
  };
  db.movements.push(m);
  logActivity('exit', `Sortie ${m.code} : ${qtyC} cartons + ${qtyP} paquets de "${p.name}" → ${r?r.name:'—'}`);
  saveDB();
  closeModal('exitModal');
  ['exitProduct','exitBeneficiary','exitNotes'].forEach(f=>document.getElementById(f).value='');
  document.getElementById('exitQtyCartons').value='0';
  document.getElementById('exitQtyPacks').value='0';
  document.getElementById('exitDate').value=today();
  document.getElementById('exitRegion').selectedIndex=0;
  document.getElementById('exitTotalCalc').style.display='none';
  document.getElementById('exitStockInfo').style.display='none';
  renderExits(); renderStock(); renderDashboard(); updateAlertBadge();
  toast(`Sortie ${m.code} enregistrée avec succès ✅`);
}

// Affiche la liste des sorties dans le tableau
function renderExits() {
  const tbody = document.getElementById('exitsTbody');
  if (!tbody) return;
  const exits = db.movements.filter(m=>m.type==='exit').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if (exits.length===0) {
    tbody.innerHTML='<tr><td colspan="9"><div class="empty-state"><p>Aucune sortie enregistrée</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = exits.map(m=>{
    const p = getProduct(m.productId);
    const r = getRegion(m.regionId);
    return `<tr>
      <td><span class="id-badge">${m.code}</span></td>
      <td>${fmtDate(m.date)}</td>
      <td>${p?`<strong>${p.name}</strong><br><small style="color:var(--text-muted)">${p.code}</small>`:'—'}</td>
      <td style="text-align:center"><strong>${m.qtyCartons||0}</strong></td>
      <td style="text-align:center">${m.qtyPacks||0}</td>
      <td>${r?`<strong>${r.name}</strong><br><small style="color:var(--text-muted)">${r.zone}</small>`:'—'}</td>
      <td>${m.beneficiary||'—'}</td>
      <td>${m.createdBy||'—'}</td>
      <td>
        <button class="btn btn-sm btn-ghost btn-icon" onclick="viewMovementDetail('${m.id}')" title="Détails">👁️</button>
        ${currentUser.level>=3?`<button class="btn btn-sm btn-ghost btn-icon" onclick="deleteMovement('${m.id}')" style="color:var(--rouge)" title="Supprimer">🗑️</button>`:''}
      </td>
    </tr>`;
  }).join('');
}

// Affiche les détails complets d'un mouvement (entrée ou sortie) dans une fenêtre modale
function viewMovementDetail(id) {
  const m = db.movements.find(x=>x.id===id);
  if (!m) return;
  const p = getProduct(m.productId);
  const r = getRegion(m.regionId);
  const isEntry = m.type==='entry';
  document.getElementById('detailModalTitle').textContent = `${isEntry?'📥':'📤'} ${m.code}`;
  document.getElementById('detailModalBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div><div class="form-hint">TYPE</div><div><span class="status-badge ${isEntry?'status-entry':'status-exit'}">${isEntry?'Entrée':'Sortie'}</span></div></div>
      <div><div class="form-hint">DATE</div><div style="font-weight:600">${fmtDate(m.date)}</div></div>
      <div><div class="form-hint">PRODUIT</div><div style="font-weight:600">${p?p.name:'—'}</div></div>
      <div><div class="form-hint">CODE PRODUIT</div><div><span class="id-badge">${p?p.code:'—'}</span></div></div>
      <div><div class="form-hint">CARTONS</div><div style="font-weight:600;font-size:18px">${m.qtyCartons||0}</div></div>
      <div><div class="form-hint">PAQUETS</div><div style="font-weight:600;font-size:18px">${m.qtyPacks||0}</div></div>
      ${isEntry?`
        <div><div class="form-hint">DONATEUR</div><div>${m.donor||'—'}</div></div>
        <div><div class="form-hint">N° LOT</div><div>${m.batch||'—'}</div></div>
        <div><div class="form-hint">DATE EXP.</div><div>${fmtDate(m.expiry)||'—'}</div></div>
      `:`
        <div><div class="form-hint">RÉGION</div><div style="font-weight:600">${r?r.name:'—'}</div></div>
        <div><div class="form-hint">BÉNÉFICIAIRE</div><div>${m.beneficiary||'—'}</div></div>
        <div><div class="form-hint">MOTIF</div><div>${m.reason||'—'}</div></div>
      `}
      <div style="grid-column:1/-1"><div class="form-hint">ENREGISTRÉ PAR</div><div>${m.createdBy||'—'} · ${fmtDateTime(m.createdAt)}</div></div>
      ${m.notes?`<div style="grid-column:1/-1"><div class="form-hint">OBSERVATIONS</div><div style="background:var(--bg);padding:10px;border-radius:8px;font-size:14px">${m.notes}</div></div>`:''}
    </div>`;
  openModal('detailModal');
}

// Supprime un mouvement (entrée ou sortie) après confirmation
function deleteMovement(id) {
  if (currentUser.level < 3) { toast('Accès non autorisé','error'); return; }
  const m = db.movements.find(x=>x.id===id);
  document.getElementById('confirmText').textContent = `Supprimer le mouvement ${m.code} ?`;
  document.getElementById('confirmBtn').onclick = ()=>{
    db.movements = db.movements.filter(x=>x.id!==id);
    logActivity('delete', `Suppression du mouvement ${m.code}`);
    saveDB(); renderEntries(); renderExits(); renderStock(); closeModal('confirmModal'); toast('Mouvement supprimé');
  };
  openModal('confirmModal');
}

// ======= GESTION DU STOCK =======
// Affiche l'état actuel du stock avec les alertes d'expiration

// Affiche le tableau récapitulatif du stock avec les alertes
function renderStock() {
  const tbody = document.getElementById('stockTbody');
  const alertsDiv = document.getElementById('expiryAlerts');
  if (!tbody) return;
  let alerts = [];
  tbody.innerHTML = db.products.map(p=>{
    const stock = getStockForProduct(p.id);
    // Find next expiry
    const expiries = db.movements.filter(m=>m.productId===p.id && m.type==='entry' && m.expiry)
      .map(m=>m.expiry).sort();
    const nextExpiry = expiries[0];
    const expStatus = getExpiryStatus(nextExpiry);
    if (expStatus==='expired') alerts.push({p,msg:'Expiré',cls:'danger'});
    else if (expStatus==='near') alerts.push({p,msg:'Expire bientôt',cls:'warning'});
    const stockPct = stock.entryPacks>0 ? Math.round(stock.totalPacks/stock.entryPacks*100) : 0;
    return `<tr>
      <td><span class="id-badge">${p.code}</span></td>
      <td><strong>${p.name}</strong></td>
      <td style="text-align:center"><strong>${stock.cartons}</strong></td>
      <td style="text-align:center">${stock.packs}</td>
      <td style="text-align:center;color:var(--success)">${stock.entryPacks}</td>
      <td style="text-align:center;color:var(--rouge)">${stock.exitPacks}</td>
      <td>${nextExpiry?`<span class="expiry-${expStatus}">${fmtDate(nextExpiry)}</span>`:'—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-bar" style="flex:1">
            <div class="progress-fill" style="width:${stockPct}%;background:${stock.totalPacks===0?'var(--rouge)':stock.totalPacks<stock.entryPacks*0.2?'var(--warning)':'var(--success)'}"></div>
          </div>
          <span style="font-size:12px;color:var(--text-muted)">${stockPct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="8"><div class="empty-state"><p>Aucun produit en stock</p></div></td></tr>';
  
  if (alerts.length>0) {
    alertsDiv.innerHTML = alerts.map(a=>`<div class="alert alert-${a.cls==='danger'?'danger':'warning'}" style="margin-bottom:8px">⚠️ <strong>${a.p.code} — ${a.p.name}</strong> : ${a.msg}</div>`).join('');
  } else alertsDiv.innerHTML='';
}

// Met à jour le badge d'alerte dans la barre de navigation (nombre de produits à problème)
function updateAlertBadge() {
  let count = 0;
  db.products.forEach(p=>{
    const expiries = db.movements.filter(m=>m.productId===p.id&&m.type==='entry'&&m.expiry).map(m=>m.expiry);
    expiries.forEach(e=>{ if(getExpiryStatus(e)!=='none'&&getExpiryStatus(e)!=='good') count++; });
    const stock = getStockForProduct(p.id);
    if (stock.totalPacks===0 && db.movements.some(m=>m.productId===p.id)) count++;
  });
  const badge = document.getElementById('alertBadge');
  if (count>0) { badge.style.display='flex'; badge.textContent=count; }
  else badge.style.display='none';
}

// ======= GESTION DES RÉGIONS =======
// Fonctions pour créer, modifier, supprimer et afficher les régions

// Enregistre une nouvelle région ou met à jour une région existante
function saveRegion() {
  if (currentUser.level < 3) { toast('Accès non autorisé','error'); return; }
  const name = document.getElementById('rName').value.trim();
  if (!name) { toast('Veuillez entrer un nom','error'); return; }
  const editId = document.getElementById('editRegionId').value;
  if (editId) {
    const r = db.regions.find(x=>x.id===editId);
    if (r) { r.name=name; r.zone=document.getElementById('rZone').value; r.contact=document.getElementById('rContact').value; }
    logActivity('edit','Modification région : '+name);
  } else {
    db.regions.push({ id:genId('r'), name, zone:document.getElementById('rZone').value, contact:document.getElementById('rContact').value });
    logActivity('create','Ajout région : '+name);
  }
  saveDB(); closeModal('regionModal'); renderRegions(); toast('Région enregistrée ✅');
}

// Affiche la liste des régions sous forme de cartes
function renderRegions() {
  const grid = document.getElementById('regionsGrid');
  if (!grid) return;
  grid.innerHTML = db.regions.map(r=>{
    const exitCount = db.movements.filter(m=>m.type==='exit'&&m.regionId===r.id).length;
    return `<div class="card" style="padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="width:42px;height:42px;background:var(--rouge-light);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px">📍</div>
        <span class="status-badge status-active">Active</span>
      </div>
      <h3 style="font-size:16px;font-weight:700;color:var(--navy)">${r.name}</h3>
      <p style="font-size:13px;color:var(--text-muted);margin-top:4px">${r.zone||'Zone non définie'}</p>
      ${r.contact?`<p style="font-size:13px;color:var(--text-light);margin-top:8px">👤 ${r.contact}</p>`:''}
      <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px;color:var(--text-muted)">${exitCount} distribution${exitCount!==1?'s':''}</span>
        ${currentUser.level>=3?`<div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-ghost btn-icon" onclick="editRegion('${r.id}')">✏️</button>
          <button class="btn btn-sm btn-ghost btn-icon" onclick="deleteRegion('${r.id}')" style="color:var(--rouge)">🗑️</button>
        </div>`:''}
      </div>
    </div>`;
  }).join('');
  if (!grid.innerHTML) grid.innerHTML = '<p style="color:var(--text-muted)">Aucune région enregistrée</p>';
}

// Ouvre le formulaire de modification d'une région existante
function editRegion(id) {
  const r = db.regions.find(x=>x.id===id);
  if (!r) return;
  document.getElementById('editRegionId').value=r.id;
  document.getElementById('rName').value=r.name;
  document.getElementById('rZone').value=r.zone||'';
  document.getElementById('rContact').value=r.contact||'';
  openModal('regionModal');
}

// Supprime une région après confirmation
function deleteRegion(id) {
  if (currentUser.level<3) return;
  const r = db.regions.find(x=>x.id===id);
  document.getElementById('confirmText').textContent = `Supprimer la région "${r.name}" ?`;
  document.getElementById('confirmBtn').onclick = ()=>{
    db.regions = db.regions.filter(x=>x.id!==id);
    logActivity('delete','Suppression région : '+r.name);
    saveDB(); renderRegions(); closeModal('confirmModal'); toast('Région supprimée');
  };
  openModal('confirmModal');
}

// ======= TABLEAU DE BORD (DASHBOARD) =======
// Affiche les statistiques et informations importantes sur la page d'accueil

// Affiche les statistiques, mouvements récents et alertes sur le tableau de bord
function renderDashboard() {
  const now = new Date();
  const thisMonth = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const monthEntries = db.movements.filter(m=>m.type==='entry'&&m.date.startsWith(thisMonth)).length;
  const monthExits = db.movements.filter(m=>m.type==='exit'&&m.date.startsWith(thisMonth)).length;
  document.getElementById('dashTotalProducts').textContent = db.products.length;
  document.getElementById('dashTotalEntries').textContent = monthEntries;
  document.getElementById('dashTotalExits').textContent = monthExits;
  document.getElementById('dashTotalRegions').textContent = db.regions.length;

  // Recent movements
  const recentMov = db.movements.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);
  const movDiv = document.getElementById('dashMovements');
  if (recentMov.length===0) {
    movDiv.innerHTML='<div class="empty-state" style="padding:30px"><p>Aucun mouvement enregistré</p></div>';
  } else {
    movDiv.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:14px">
      ${recentMov.map(m=>{
        const p=getProduct(m.productId); const r=getRegion(m.regionId);
        return `<tr>
          <td style="padding:10px 16px"><span class="status-badge ${m.type==='entry'?'status-entry':'status-exit'}">${m.type==='entry'?'📥 Entrée':'📤 Sortie'}</span></td>
          <td style="padding:10px 16px"><strong>${p?p.name:'—'}</strong></td>
          <td style="padding:10px 16px">${m.qtyCartons||0} cartons + ${m.qtyPacks||0} paquets</td>
          <td style="padding:10px 16px;color:var(--text-muted)">${fmtDate(m.date)}</td>
          <td style="padding:10px 16px;color:var(--text-muted)">${m.createdBy||'—'}</td>
        </tr>`;
      }).join('')}
    </table>`;
  }

  // Alerts
  let alertsHTML = '';
  db.products.forEach(p=>{
    const stock = getStockForProduct(p.id);
    if (stock.totalPacks===0 && db.movements.some(m=>m.productId===p.id)) alertsHTML+=`<div class="alert alert-danger" style="margin-bottom:8px;padding:8px 12px;font-size:13px">📭 <strong>${p.name}</strong> : Stock épuisé</div>`;
    const expiries = db.movements.filter(m=>m.productId===p.id&&m.type==='entry'&&m.expiry).map(m=>m.expiry);
    expiries.forEach(e=>{
      const s=getExpiryStatus(e);
      if(s==='expired') alertsHTML+=`<div class="alert alert-danger" style="margin-bottom:8px;padding:8px 12px;font-size:13px">⛔ <strong>${p.name}</strong> : Expiré le ${fmtDate(e)}</div>`;
      else if(s==='near') alertsHTML+=`<div class="alert alert-warning" style="margin-bottom:8px;padding:8px 12px;font-size:13px">⚠️ <strong>${p.name}</strong> : Expire le ${fmtDate(e)}</div>`;
    });
  });
  const alertsDiv = document.getElementById('dashAlerts');
  alertsDiv.innerHTML = alertsHTML || '<p style="color:var(--text-muted);font-size:14px">✅ Aucune alerte active</p>';

  // Activity
  const recentActivity = db.activityLog.slice(0,8);
  const actDiv = document.getElementById('dashActivity');
  actDiv.innerHTML = recentActivity.length===0 ? '<p style="color:var(--text-muted);font-size:14px">Aucune activité récente</p>' :
    recentActivity.map(a=>`<div class="activity-item">
      <div class="activity-dot ${a.action}"></div>
      <div><div class="activity-text"><strong>${a.fullname}</strong> — ${a.details}</div><div class="activity-meta">${fmtDateTime(a.timestamp)}</div></div>
    </div>`).join('');
}

// ======= REPORTS =======
function switchTab(page, panel) {
  document.querySelectorAll(`#${page}Page .tab-btn`).forEach(b=>b.classList.remove('active'));
  document.querySelectorAll(`#${page}Page .tab-panel`).forEach(p=>p.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(`${page}-${panel}`).classList.add('active');
}

function renderReports() {
  // All movements
  const tbody = document.getElementById('allMovementsTbody');
  if (tbody) {
    const all = [...db.movements].sort((a,b)=>new Date(b.date)-new Date(a.date));
    tbody.innerHTML = all.map(m=>{
      const p=getProduct(m.productId); const r=getRegion(m.regionId);
      return `<tr>
        <td><span class="id-badge">${m.code}</span></td>
        <td>${fmtDate(m.date)}</td>
        <td><span class="status-badge ${m.type==='entry'?'status-entry':'status-exit'}">${m.type==='entry'?'Entrée':'Sortie'}</span></td>
        <td>${p?p.name:'—'}</td>
        <td>${m.qtyCartons||0}</td>
        <td>${m.qtyPacks||0}</td>
        <td>${r?r.name:'—'}</td>
        <td>${m.createdBy||'—'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Aucun mouvement</td></tr>';
  }

  // Stats
  const statsDiv = document.getElementById('reportStats');
  if (statsDiv) {
    const totalE = db.movements.filter(m=>m.type==='entry').reduce((a,m)=>a+(m.qtyCartons||0),0);
    const totalS = db.movements.filter(m=>m.type==='exit').reduce((a,m)=>a+(m.qtyCartons||0),0);
    statsDiv.innerHTML = `
      <div class="stat-card red"><div class="stat-icon">📦</div><div class="stat-value">${db.products.length}</div><div class="stat-label">Produits catalogués</div></div>
      <div class="stat-card navy"><div class="stat-icon">📥</div><div class="stat-value">${db.movements.filter(m=>m.type==='entry').length}</div><div class="stat-label">Opérations d'entrée</div></div>
      <div class="stat-card gold"><div class="stat-icon">📤</div><div class="stat-value">${db.movements.filter(m=>m.type==='exit').length}</div><div class="stat-label">Opérations de sortie</div></div>
      <div class="stat-card green"><div class="stat-icon">🗺️</div><div class="stat-value">${db.regions.length}</div><div class="stat-label">Zones couvertes</div></div>`;
  }

  // By region
  const regionDiv = document.getElementById('regionReport');
  if (regionDiv) {
    regionDiv.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Région</th><th>Zone</th><th>Nb distributions</th><th>Cartons distribués</th><th>Paquets distribués</th></tr></thead><tbody>
      ${db.regions.map(r=>{
        const exits = db.movements.filter(m=>m.type==='exit'&&m.regionId===r.id);
        const cartons = exits.reduce((a,m)=>a+(m.qtyCartons||0),0);
        const packs = exits.reduce((a,m)=>a+(m.qtyPacks||0),0);
        return `<tr><td><strong>${r.name}</strong></td><td>${r.zone||'—'}</td><td>${exits.length}</td><td>${cartons}</td><td>${packs}</td></tr>`;
      }).join('')}
    </tbody></table></div>`;
  }

  // By product
  const productDiv = document.getElementById('productReport');
  if (productDiv) {
    productDiv.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Produit</th><th>Entrées (cartons)</th><th>Sorties (cartons)</th><th>Stock net</th></tr></thead><tbody>
      ${db.products.map(p=>{
        const stock = getStockForProduct(p.id);
        const entryC = db.movements.filter(m=>m.type==='entry'&&m.productId===p.id).reduce((a,m)=>a+(m.qtyCartons||0),0);
        const exitC = db.movements.filter(m=>m.type==='exit'&&m.productId===p.id).reduce((a,m)=>a+(m.qtyCartons||0),0);
        return `<tr><td><span class="id-badge">${p.code}</span></td><td><strong>${p.name}</strong></td><td style="color:var(--success)">${entryC}</td><td style="color:var(--rouge)">${exitC}</td><td style="font-weight:700">${stock.cartons}</td></tr>`;
      }).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Aucun produit</td></tr>'}
    </tbody></table></div>`;
  }
}

function exportReport() {
  let csv = 'Code,Date,Type,Produit,Cartons,Paquets,Region,Operateur\n';
  db.movements.forEach(m=>{
    const p=getProduct(m.productId); const r=getRegion(m.regionId);
    csv += `${m.code},${m.date},${m.type==='entry'?'Entrée':'Sortie'},"${p?p.name:''}",${m.qtyCartons||0},${m.qtyPacks||0},"${r?r.name:''}",${m.createdBy||''}\n`;
  });
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='rapport_croixrouge_ci.csv'; a.click();
  toast('Rapport exporté ✅');
}

// ======= USERS =======
function saveUser() {
  if (currentUser.level < 3) { toast('Accès non autorisé','error'); return; }
  const username = document.getElementById('uUsername').value.trim();
  const fullname = document.getElementById('uFullname').value.trim();
  const password = document.getElementById('uPassword').value;
  const level = parseInt(document.getElementById('uLevel').value);
  
  if (!username || !fullname) { toast('Veuillez remplir les champs obligatoires','error'); return; }
  const editId = document.getElementById('editUserId').value;
  
  if (editId) {
    const u = db.users.find(x=>x.id===editId);
    if (u) {
      u.username=username; u.fullname=fullname; u.role=document.getElementById('uRole').value; u.level=level;
      if(password) u.password=password;
      logActivity('edit',`Modification utilisateur : ${username}`);
      toast('Utilisateur modifié ✅');
    }
  } else {
    if (db.users.find(x=>x.username===username)) { toast('Cet identifiant existe déjà','error'); return; }
    if (!password) { toast('Le mot de passe est requis','error'); return; }
    const u = { id:genId('u'), username, fullname, password, role:document.getElementById('uRole').value, level, active:true, lastLogin:null };
    db.users.push(u);
    logActivity('create',`Création utilisateur : ${username} (Niveau ${level})`);
    toast('Utilisateur créé ✅');
  }
  saveDB(); closeModal('userModal'); renderUsers();
}

function editUser(id) {
  if (currentUser.level < 3) return;
  const u = db.users.find(x=>x.id===id);
  if (!u) return;
  document.getElementById('editUserId').value = u.id;
  document.getElementById('userModalTitle').textContent = '✏️ Modifier l\'utilisateur';
  document.getElementById('uUsername').value = u.username;
  document.getElementById('uFullname').value = u.fullname;
  document.getElementById('uPassword').value = '';
  document.getElementById('uRole').value = u.role||'';
  document.getElementById('uLevel').value = u.level;
  openModal('userModal');
}

function toggleUser(id) {
  if (currentUser.level < 3) return;
  const u = db.users.find(x=>x.id===id);
  if (!u) return;
  if (u.id === currentUser.id) { toast('Vous ne pouvez pas vous désactiver vous-même','error'); return; }
  u.active = !u.active;
  logActivity('edit',`${u.active?'Activation':'Désactivation'} du compte : ${u.username}`);
  saveDB(); renderUsers(); toast(`Compte ${u.active?'activé':'désactivé'}`);
}

function deleteUser(id) {
  if (currentUser.level < 4) { toast('Seul un administrateur peut supprimer des comptes','error'); return; }
  const u = db.users.find(x=>x.id===id);
  if (!u) return;
  if (u.id===currentUser.id) { toast('Vous ne pouvez pas supprimer votre propre compte','error'); return; }
  document.getElementById('confirmText').textContent = `Supprimer le compte de "${u.fullname}" (${u.username}) ?`;
  document.getElementById('confirmBtn').onclick = ()=>{
    db.users = db.users.filter(x=>x.id!==id);
    logActivity('delete',`Suppression compte : ${u.username}`);
    saveDB(); renderUsers(); closeModal('confirmModal'); toast('Compte supprimé');
  };
  openModal('confirmModal');
}

function renderUsers() {
  const tbody = document.getElementById('usersTbody');
  if (!tbody) return;
  tbody.innerHTML = db.users.map(u=>`<tr>
    <td><strong>${u.username}</strong>${u.id===currentUser.id?'<span style="background:var(--gold-light);color:var(--warning);font-size:10px;padding:2px 6px;border-radius:10px;margin-left:6px">Moi</span>':''}</td>
    <td>${u.fullname}</td>
    <td>${u.role||'—'}</td>
    <td><span class="level-badge level-${u.level}">${levelLabel(u.level)}</span></td>
    <td>${fmtDateTime(u.lastLogin)||'—'}</td>
    <td><span class="status-badge ${u.active?'status-active':'status-exit'}">${u.active?'Actif':'Inactif'}</span></td>
    <td>
      <div style="display:flex;gap:6px">
        ${currentUser.level>=4?`<button class="btn btn-sm btn-ghost btn-icon" onclick="editUser('${u.id}')" title="Modifier">✏️</button>
        <button class="btn btn-sm btn-ghost btn-icon" onclick="toggleUser('${u.id}')" title="${u.active?'Désactiver':'Activer'}">${u.active?'🔒':'🔓'}</button>`:''}
        ${currentUser.level>=4?`<button class="btn btn-sm btn-ghost btn-icon" onclick="deleteUser('${u.id}')" style="color:var(--rouge)" title="Supprimer">🗑️</button>`:''}
      </div>
    </td>
  </tr>`).join('');

  // Counters
  [1,2,3,4].forEach(l=>{
    const el = document.getElementById('countL'+l);
    if (el) el.textContent = db.users.filter(u=>u.level===l).length;
  });
}

// ======= ACTIVITY LOG =======
function renderActivityLog() {
  const container = document.getElementById('activityLogContainer');
  const userFilter = document.getElementById('filterUser');
  const actionFilter = document.getElementById('filterAction');
  if (!container) return;
  
  // Populate user filter
  if (userFilter) {
    const cur = userFilter.value;
    userFilter.innerHTML = '<option value="">Tous les utilisateurs</option>';
    db.users.forEach(u=>{ userFilter.innerHTML += `<option value="${u.username}">${u.fullname}</option>`; });
    userFilter.value = cur;
  }
  
  let logs = [...db.activityLog];
  if (userFilter && userFilter.value) logs = logs.filter(l=>l.username===userFilter.value);
  if (actionFilter && actionFilter.value) logs = logs.filter(l=>l.action===actionFilter.value);
  
  if (logs.length===0) {
    container.innerHTML='<p style="color:var(--text-muted)">Aucune activité enregistrée</p>';
    return;
  }
  container.innerHTML = logs.map(a=>`<div class="activity-item">
    <div class="activity-dot ${a.action}"></div>
    <div style="flex:1">
      <div class="activity-text">
        <strong>${a.fullname}</strong>
        <span style="background:var(--bg2);padding:2px 8px;border-radius:10px;font-size:11px;margin:0 6px">${a.username}</span>
        — ${a.details}
      </div>
      <div class="activity-meta">${fmtDateTime(a.timestamp)} · Action: ${a.action}</div>
    </div>
  </div>`).join('');
}

function clearActivityLog() {
  if (currentUser.level < 4) { toast('Accès non autorisé','error'); return; }
  document.getElementById('confirmText').textContent = 'Effacer tout le journal d\'activité ?';
  document.getElementById('confirmBtn').onclick = ()=>{
    db.activityLog = [];
    saveDB(); renderActivityLog(); closeModal('confirmModal'); toast('Journal effacé');
  };
  openModal('confirmModal');
}

// ======= SEARCH / FILTER =======
function filterTable(inputId, tableId) {
  const val = document.getElementById(inputId).value.toLowerCase();
  const table = document.getElementById(tableId);
  if (!table) return;
  table.querySelectorAll('tbody tr').forEach(tr=>{
    const text = tr.textContent.toLowerCase();
    tr.style.display = text.includes(val) ? '' : 'none';
  });
}

// ======= SIDEBAR MOBILE (détection JS, indépendante du breakpoint CSS) =======
function checkMobile() {
  const isMobile = window.innerWidth < 960 || ('ontouchstart' in window && window.innerWidth < 1100);
  document.body.classList.toggle('is-mobile', isMobile);
  if (!isMobile) closeSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}
window.addEventListener('resize', checkMobile);
checkMobile(); // run immediately

// ======= INIT =======
loadDB();

// Show login hints + auto-close sidebar on nav click
document.addEventListener('DOMContentLoaded', ()=>{
  const hint = document.querySelector('.login-hint');
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click', ()=>{ if(document.body.classList.contains('is-mobile')) closeSidebar(); });


    //petit ajout 1
document.getElementById("entryDonorSource").addEventListener("change", function () {
    const donorInput = document.getElementById("entryAcqAmount");

    if (this.value === "Acquisition") {
        donorInput.style.display = "block";
    } else {
        donorInput.style.display = "none";
        donorInput.value = ""; // on vide le montant si ce n’est pas un donateur
    }
});

    //petit ajout 2
document.getElementById("entryDonorSource").addEventListener("change", function () {
    const entryDonor = document.getElementById("entryDonor");

    if (this.value === "Donateur (don ou achat)") {
        entryDonor.style.display = "block";
    } else {
        entryDonor.style.display = "none";
        entryDonor.value = ""; // on vide le nom si ce n’est pas un donateur
    }
});
  });
});


