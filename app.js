/**
 * BASKI KALIPLARI STOK TAKİP PROGRAMI 
 * 
 * GOOGLE SHEETS ENTEGRASYONU İÇİN NOT:
 * Uygulamanın Google Sheets ile çalışması için bir "Google Apps Script" Web App oluşturmanız gerekmektedir.
 * Web App URL'sini aşağıdaki 'SCRIPT_URL' değişkenine yapıştırın.
 * Eğer SCRIPT_URL boşsa, uygulama tarayıcı belleğinde (localStorage) çalışır.
 */

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyeO-E-GPKjzByXoLy0GT1cdTNsuCuuliILtnOSm56FOZHM02C7v6sdePehGP-S9ubsUw/exec';

let currentPlateTab = 'all';

// App State
let appState = {
    currentUser: null,
    plates: [],
    activities: [],
    users: [],
    dropdowns: null,
    activityPage: 0
};

// DOM Elements
const views = document.querySelectorAll('.view-section');
const navLinks = document.querySelectorAll('.sidebar-link');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginOverlay = document.getElementById('login-overlay');
const appContainer = document.getElementById('app-container');
const roleBadge = document.getElementById('current-user-role');
const navUsersLink = document.getElementById('nav-users');
const rememberMeCheckbox = document.getElementById('remember-me');

const addPlateForm = document.getElementById('add-plate-form');
const plateTableBody = document.getElementById('plate-table-body');
const activityList = document.getElementById('activity-list');
const searchPlate = document.getElementById('search-plate');

const userTableBody = document.getElementById('user-table-body');
const openAddUserBtn = document.getElementById('open-add-user-btn');
const userModal = document.getElementById('user-modal');
const userForm = document.getElementById('user-form');

// Modal Elements
const editPlateModal = document.getElementById('edit-plate-modal');
const closeModalBtns = document.querySelectorAll('.close-modal');
const editPlateForm = document.getElementById('edit-plate-form');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Theme initialization — default to light
    // Theme fixed to light

    const rememberedId = localStorage.getItem('rememberedUserId');
    if (!rememberedId) {
        document.getElementById('login-overlay').classList.add('active');
    }

    setupEventListeners();

    // 1. Sıfır bekleme süresi: Anında yerel önbellek yüklenir ve açılır
    loadLocal();

    if (rememberedId) {
        let user = appState.users.find(u => u.id === rememberedId);
        // Emergency admin fallback — not stored in users array
        if (!user && rememberedId === 'U1_emergency') {
            user = {
                id: 'U1_emergency',
                username: 'admin',
                password: '123',
                role: 'superadmin',
                permissions: ['dashboard', 'add-plate', 'plate-list']
            };
        }
        if (user) {
            if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
            performLogin(user);
        } else {
            document.getElementById('login-overlay').classList.add('active');
        }
    }

    // 2. Arka planda Google Sheets ile sessizce senkronize ol
    syncCloudData();
});



// Setup Event Listeners
function setupEventListeners() {
    // Breadcrumb labels for each view
    const breadcrumbMap = {
        'dashboard': 'Dashboard',
        'add-plate': 'Kalıp Ekle',
        'plate-list': 'Kalıp Listesi',
        'user-management': 'Kullanıcı Yönetimi'
    };

    // Navigation
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sidebarLink = e.target.closest('.sidebar-link');
            if (!sidebarLink) return;
            const target = sidebarLink.getAttribute('data-target');
            switchView(target);

            navLinks.forEach(l => l.classList.remove('active'));
            sidebarLink.classList.add('active');

            // Update breadcrumb
            const bc = document.getElementById('breadcrumb-current');
            if (bc) bc.textContent = breadcrumbMap[target] || target;

            // Close sidebar on mobile
            const sidebar = document.getElementById('sidebar');
            if (sidebar && window.innerWidth <= 1024) {
                sidebar.classList.remove('open');
            }
        });
    });

    // Sidebar toggle (mobile)
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('open');
        });
    }

    // Enter key on login fields
    [loginUsername, loginPassword].forEach(input => {
        if (input) input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') loginBtn.click();
        });
    });

    // Login / Logout
    loginBtn.addEventListener('click', () => {
        const username = loginUsername.value.trim();
        const password = loginPassword.value.trim();

        let user = appState.users.find(u => u.username === username && u.password === password);

        // Acil durum girişi: Excel tablosunda kullanıcılar silinirse veya bozulursa admin olarak girebilmesi için
        if (!user && username === 'admin' && password === '123') {
            user = {
                id: 'U1_emergency',
                username: 'admin',
                password: '123',
                role: 'superadmin',
                permissions: ['dashboard', 'add-plate', 'plate-list']
            };
        }

        if (!user) {
            showToast('Geçersiz kullanıcı adı veya şifre!', 'error');
            return;
        }

        if (rememberMeCheckbox && rememberMeCheckbox.checked) {
            localStorage.setItem('rememberedUserId', user.id);
        } else {
            localStorage.removeItem('rememberedUserId');
        }

        performLogin(user);
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('rememberedUserId');
            localStorage.removeItem('lastView');
            appState.currentUser = null;
            appContainer.style.display = 'none';
            loginOverlay.classList.add('active');
        });
    }

    // Forms
    addPlateForm.addEventListener('submit', handleAddPlate);
    if (editPlateForm) editPlateForm.addEventListener('submit', handleEditPlateForm);

    // Add plate distribution hint
    const distFields = ['plate-count', 'plate-stock-count', 'plate-washing-count', 'plate-coating-count', 'plate-clean-count'];
    distFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateAddDistHint);
    });

    // UI Interactions
    handleImageSelection('plate-image-file', 'plate-image-preview', 'plate-image', 'plate-image-placeholder');
    handleImageSelection('edit-plate-image-file', 'edit-plate-image-preview', 'edit-plate-image', 'edit-plate-image-placeholder');

    // Otomatik inç + tür -> kalıp ölçüsü ataması
    const setupAutoSize = (typeSelectId, inchSelectId, sizeSelectId) => {
        const typeElem = document.getElementById(typeSelectId);
        const inchElem = document.getElementById(inchSelectId);
        const sizeElem = document.getElementById(sizeSelectId);
        if (!inchElem || !sizeElem) return;

        const autoFill = () => {
            const inch = inchElem.value;
            const type = typeElem ? typeElem.value : '';
            if (type === 'Tepe' && inch === '12"') {
                sizeElem.value = '(23x36)';
            } else if (inch === '12"') {
                sizeElem.value = '(23x31)';
            } else if (inch === '18"') {
                sizeElem.value = '(52x60)';
            } else if (inch === '24" & 36"') {
                sizeElem.value = '(67.5x81.5)';
            } else if (inch === 'KALP') {
                sizeElem.value = '(34x49)';
            }
        };

        inchElem.addEventListener('change', autoFill);
        if (typeElem) typeElem.addEventListener('change', autoFill);
    };
    setupAutoSize('plate-type', 'plate-inch', 'plate-size');
    setupAutoSize('edit-plate-type', 'edit-plate-inch', 'edit-plate-size');

    searchPlate.addEventListener('keyup', (e) => {
        renderPlates(e.target.value.toLowerCase());
    });

    // Plate list filters
    const filterType = document.getElementById('filter-type');
    const filterInch = document.getElementById('filter-inch');
    const clearFilters = document.getElementById('clear-filters');

    const onFilterChange = () => {
        const hasFilter = filterType.value || filterInch.value;
        if (clearFilters) clearFilters.style.display = hasFilter ? '' : 'none';
        renderPlates(searchPlate.value.toLowerCase());
    };

    if (filterType) filterType.addEventListener('change', onFilterChange);
    if (filterInch) filterInch.addEventListener('change', onFilterChange);
    if (clearFilters) clearFilters.addEventListener('click', () => {
        if (filterType) filterType.value = '';
        if (filterInch) filterInch.value = '';
        clearFilters.style.display = 'none';
        renderPlates(searchPlate.value.toLowerCase());
    });

    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (editPlateModal) editPlateModal.classList.remove('active');
            if (userModal) userModal.classList.remove('active');
        });
    });

    if (userForm) userForm.addEventListener('submit', handleUserForm);
    if (openAddUserBtn) {
        openAddUserBtn.addEventListener('click', () => {
            userForm.reset();
            document.getElementById('edit-user-id').value = '';
            document.getElementById('user-modal-title').textContent = 'Yeni Kullanıcı Ekle';
            userModal.classList.add('active');
        });
    }

    // Activity pagination
    const actPrev = document.getElementById('activity-prev');
    const actNext = document.getElementById('activity-next');
    if (actPrev) actPrev.addEventListener('click', () => { appState.activityPage = Math.max(0, (appState.activityPage || 0) - 1); renderDashboard(); });
    if (actNext) actNext.addEventListener('click', () => { appState.activityPage = (appState.activityPage || 0) + 1; renderDashboard(); });

    // Dashboard card click → filter modal
    document.querySelectorAll('.card-clickable').forEach(card => {
        card.addEventListener('click', () => {
            const filter = card.getAttribute('data-filter') || 'all';
            openDashboardFilterModal(filter);
        });
    });

    // Movement modal
    const stepperMinus = document.getElementById('stepper-minus');
    const stepperPlus = document.getElementById('stepper-plus');
    const movementCountInput = document.getElementById('movement-count');
    const movementConfirmBtn = document.getElementById('movement-confirm-btn');
    const movementCancelBtn = document.getElementById('movement-cancel-btn');
    const movementModal = document.getElementById('movement-modal');

    if (stepperMinus) stepperMinus.addEventListener('click', () => {
        const v = parseInt(movementCountInput.value) || 1;
        if (v > 1) movementCountInput.value = v - 1;
    });
    if (stepperPlus) stepperPlus.addEventListener('click', () => {
        const v = parseInt(movementCountInput.value) || 1;
        const mx = parseInt(movementCountInput.max) || 9999;
        if (v < mx) movementCountInput.value = v + 1;
    });
    if (movementConfirmBtn) movementConfirmBtn.addEventListener('click', confirmMovement);
    if (movementCancelBtn) movementCancelBtn.addEventListener('click', () => { if (movementModal) movementModal.classList.remove('active'); });
    if (movementModal) movementModal.addEventListener('click', (e) => { if (e.target === movementModal) movementModal.classList.remove('active'); });

    // Dashboard filter modal close on backdrop
    const dfmModal = document.getElementById('dashboard-filter-modal');
    if (dfmModal) {
        dfmModal.addEventListener('click', (e) => {
            if (e.target === dfmModal) dfmModal.classList.remove('active');
        });
    }

    // Image preview modal close on backdrop
    const imgModal = document.getElementById('image-preview-modal');
    if (imgModal) {
        imgModal.addEventListener('click', (e) => {
            if (e.target === imgModal) imgModal.classList.remove('active');
        });
    }
}

function performLogin(user) {
    appState.currentUser = user;
    if (roleBadge) roleBadge.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);

    navLinks.forEach(link => {
        const target = link.getAttribute('data-target');
        if (target === 'user-management') return;
        link.style.display = user.permissions.includes(target) ? '' : 'none';
    });

    if (navUsersLink) navUsersLink.style.display = user.role === 'superadmin' ? '' : 'none';

    navLinks.forEach(l => l.classList.remove('active'));

    const hash = window.location.hash.replace('#', '');
    let targetRoute = null;

    // Hash routing resolution
    if (hash === 'users' && user.role === 'superadmin') {
        targetRoute = 'user-management';
    } else if (hash === 'add') {
        if (user.permissions.includes('add-plate')) targetRoute = 'add-plate';
    } else if (hash === 'list') {
        if (user.permissions.includes('plate-list')) targetRoute = 'plate-list';
    } else if (hash === 'dashboard') {
        if (user.permissions.includes('dashboard')) targetRoute = 'dashboard';
    }

    // Fallback to last visited view if no hash match
    if (!targetRoute) {
        const lastView = localStorage.getItem('lastView');
        if (lastView === 'user-management' && user.role === 'superadmin') {
            targetRoute = 'user-management';
        } else if (lastView && user.permissions.includes(lastView)) {
            targetRoute = lastView;
        }
    }

    if (targetRoute) {
        switchView(targetRoute);
        const linkSelector = targetRoute === 'user-management' ? '#nav-users' : `[data-target="${targetRoute}"]`;
        document.querySelector(linkSelector)?.classList.add('active');
    } else if (user.permissions.includes('dashboard')) {
        switchView('dashboard');
        document.querySelector('[data-target="dashboard"]')?.classList.add('active');
    } else if (user.permissions.length > 0) {
        switchView(user.permissions[0]);
        document.querySelector(`[data-target="${user.permissions[0]}"]`)?.classList.add('active');
    } else if (user.role === 'superadmin') {
        switchView('user-management');
        if (navUsersLink) navUsersLink.classList.add('active');
    }

    loginOverlay.classList.remove('active');
    appContainer.style.display = 'block';

    renderAll();
}

// Switching Views
function switchView(targetId) {
    localStorage.setItem('lastView', targetId);

    views.forEach(view => {
        if (view.id === targetId) {
            view.classList.add('active');
        } else {
            view.classList.remove('active');
        }
    });

    if (targetId === 'dashboard') {
        document.body.classList.remove('compact-nav');
    } else {
        document.body.classList.add('compact-nav');
    }

    // Re-render specifics if needed
    if (targetId === 'dashboard') renderDashboard();
    if (targetId === 'plate-list') { renderPlates(); renderTypeSummaryCards(); renderTabCounts(); }
    if (targetId === 'user-management') renderUsers();
}

// Convert Google Drive view URLs to direct image URLs
function getDisplayImageUrl(url) {
    if (!url) return '';
    if (url.includes('drive.google.com')) {
        const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        const match2 = url.match(/id=([a-zA-Z0-9_-]+)/);
        const fileId = match1 ? match1[1] : (match2 ? match2[1] : null);
        if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`;
    }
    return url;
}

// Form Handlers
async function handleAddPlate(e) {
    e.preventDefault();

    // yetki kontrolü
    if (appState.currentUser && appState.currentUser.role === 'operator') {
        showToast('Baskı sorumlularının yeni kalıp ekleme yetkisi yoktur.', 'warning');
        return;
    }

    const nameVal = document.getElementById('plate-name').value.trim();
    const typeVal = document.getElementById('plate-type').value;
    const inchVal = document.getElementById('plate-inch').value;
    const sizeVal = document.getElementById('plate-size').value;
    const countVal = document.getElementById('plate-count').value;

    if (!nameVal || !typeVal || !inchVal || !sizeVal || !countVal) {
        showToast('Lütfen tüm alanları doldurunuz!', 'warning');
        return;
    }

    const totalCount  = parseInt(countVal);
    const washingCount = parseInt(document.getElementById('plate-washing-count')?.value) || 0;
    const coatingCount = parseInt(document.getElementById('plate-coating-count')?.value) || 0;
    const cleanCount   = parseInt(document.getElementById('plate-clean-count')?.value)   || 0;
    const specifiedStock = parseInt(document.getElementById('plate-stock-count')?.value) || 0;

    const distSum = specifiedStock + washingCount + coatingCount + cleanCount;

    if (distSum > totalCount) {
        showToast(`Dağılım toplamı (${distSum}) toplam adetten (${totalCount}) fazla olamaz!`, 'warning');
        return;
    }

    // Dağılım girilmemişse tümü stoka at; kısmi girilmişse fark stoka gider
    const stockCount = distSum === 0 ? totalCount : specifiedStock + (totalCount - distSum);

    const newPlate = {
        id: 'P' + Date.now(),
        image: document.getElementById('plate-image').value,
        name: nameVal,
        type: typeVal,
        inch: inchVal,
        size: sizeVal,
        totalCount,
        stockCount,
        washingCount,
        coatingCount,
        cleanCount,
        dateAdded: nowFormatted()
    };

    appState.plates.push(newPlate);

    const distParts = [];
    if (stockCount > 0)   distParts.push(`${stockCount} stokta`);
    if (washingCount > 0) distParts.push(`${washingCount} yıkamada`);
    if (coatingCount > 0) distParts.push(`${coatingCount} kaplamada`);
    if (cleanCount > 0)   distParts.push(`${cleanCount} baskısız temiz`);
    logActivity(`Yeni kalıp eklendi: ${newPlate.name} — ${newPlate.type}, ${newPlate.inch} (${totalCount} adet${distParts.length ? ': ' + distParts.join(', ') : ''})`, 'add');

    saveData();

    addPlateForm.reset();
    document.getElementById('plate-stock-count').value   = 0;
    document.getElementById('plate-washing-count').value = 0;
    document.getElementById('plate-coating-count').value = 0;
    document.getElementById('plate-clean-count').value   = 0;
    updateAddDistHint();
    const prevImg = document.getElementById('plate-image-preview');
    prevImg.style.display = 'none';
    prevImg.src = '';
    document.getElementById('plate-image').value = '';
    document.getElementById('plate-image-placeholder').style.display = 'flex';

    showToast(`"${newPlate.name}" başarıyla kaydedildi.`, 'success');
    switchView('plate-list');
    document.querySelector('[data-target="plate-list"]').click();
}

window.editPlate = function (plateId) {
    const plate = appState.plates.find(p => p.id === plateId);
    if (!plate) return;

    // FIRST render dropdown options so the select elements have the right <option> tags
    renderDropdowns();

    // THEN set values after a microtask to ensure DOM is updated
    setTimeout(() => {
        document.getElementById('edit-plate-id').value = plate.id;
        document.getElementById('edit-plate-name').value = plate.name;
        document.getElementById('edit-plate-image').value = plate.image || '';
        document.getElementById('edit-plate-image-preview').src = getDisplayImageUrl(plate.image || '');
        if (!plate.image) {
            document.getElementById('edit-plate-image-preview').style.display = 'none';
            document.getElementById('edit-plate-image-placeholder').style.display = 'flex';
        } else {
            document.getElementById('edit-plate-image-preview').style.display = 'block';
            document.getElementById('edit-plate-image-placeholder').style.display = 'none';
        }
        document.getElementById('edit-plate-type').value = plate.type;
        document.getElementById('edit-plate-inch').value = plate.inch;
        document.getElementById('edit-plate-size').value = plate.size;
        document.getElementById('edit-plate-count').value = plate.totalCount;

        const stockInput   = document.getElementById('edit-plate-stock');
        const washingInput = document.getElementById('edit-plate-washing');
        const coatingInput = document.getElementById('edit-plate-coating');
        const cleanInput   = document.getElementById('edit-plate-clean');
        const hintEl       = document.getElementById('edit-counts-hint');
        if (stockInput)   stockInput.value   = plate.stockCount || 0;
        if (washingInput) washingInput.value = plate.washingCount || 0;
        if (coatingInput) coatingInput.value = plate.coatingCount || 0;
        if (cleanInput)   cleanInput.value   = plate.cleanCount || 0;
        if (hintEl) hintEl.textContent = `Toplam: ${plate.totalCount} adet`;

        const updateHint = () => {
            const s = parseInt(stockInput?.value||0) + parseInt(washingInput?.value||0) + parseInt(coatingInput?.value||0) + parseInt(cleanInput?.value||0);
            if (hintEl) hintEl.textContent = `Dağılım: ${s} / ${parseInt(document.getElementById('edit-plate-count').value)||0} adet`;
        };
        [stockInput, washingInput, coatingInput, cleanInput].forEach(el => { if (el) el.addEventListener('input', updateHint); });

        // File input'u sıfırla — aksi hâlde tarayıcı change event'ini ikinci açılışta tetiklemiyor
        const fileInput = document.getElementById('edit-plate-image-file');
        if (fileInput) fileInput.value = '';

        editPlateModal.classList.add('active');
    }, 0);
}

async function handleEditPlateForm(e) {
    e.preventDefault();

    const id = document.getElementById('edit-plate-id').value;
    const plate = appState.plates.find(p => p.id === id);
    if (!plate) return;

    const oldName = plate.name;
    const oldType = plate.type;
    const oldInch = plate.inch;
    const oldCount = plate.totalCount;

    plate.name = document.getElementById('edit-plate-name').value;
    plate.image = document.getElementById('edit-plate-image').value;
    plate.type = document.getElementById('edit-plate-type').value;
    plate.inch = document.getElementById('edit-plate-inch').value;
    plate.size = document.getElementById('edit-plate-size').value;
    const newCount = parseInt(document.getElementById('edit-plate-count').value);

    const newStock   = parseInt(document.getElementById('edit-plate-stock')?.value   || plate.stockCount);
    const newWashing = parseInt(document.getElementById('edit-plate-washing')?.value || plate.washingCount);
    const newCoating = parseInt(document.getElementById('edit-plate-coating')?.value || plate.coatingCount);
    const newClean   = parseInt(document.getElementById('edit-plate-clean')?.value   || (plate.cleanCount || 0));
    const distSum = newStock + newWashing + newCoating + newClean;

    if (distSum > newCount) {
        showToast(`Dağılım toplamı (${distSum}) toplam adetten (${newCount}) fazla olamaz!`, 'warning');
        return;
    }

    plate.totalCount  = newCount;
    plate.stockCount  = newStock;
    plate.washingCount = newWashing;
    plate.coatingCount = newCoating;
    plate.cleanCount   = newClean;

    const changes = [];
    if (plate.name !== oldName) changes.push(`Ad: "${oldName}" → "${plate.name}"`);
    if (plate.type !== oldType) changes.push(`Tür: ${oldType} → ${plate.type}`);
    if (plate.inch !== oldInch) changes.push(`İnç: ${oldInch} → ${plate.inch}`);
    if (newCount !== oldCount) changes.push(`Adet: ${oldCount} → ${newCount}`);
    const changeStr = changes.length > 0 ? ` (${changes.join(', ')})` : '';

    logActivity(`${plate.name} kalıbı güncellendi${changeStr} — ${plate.type}, ${plate.inch}`, 'update');
    saveData();

    editPlateModal.classList.remove('active');
    showToast(`"${plate.name}" başarıyla güncellendi.`, 'success');
    renderAll();
}

function logActivity(message, type) {
    const act = {
        id: Date.now(),
        message: message,
        type: type, // add, update, delete
        user: appState.currentUser ? appState.currentUser.username : 'Sistem',
        timestamp: nowFormatted()
    };
    appState.activities.unshift(act);
    if (appState.activities.length > 20) appState.activities.pop();
}

// Render Functions
function updateAddDistHint() {
    const hint = document.getElementById('add-dist-hint');
    if (!hint) return;
    const total    = parseInt(document.getElementById('plate-count')?.value) || 0;
    const stock    = parseInt(document.getElementById('plate-stock-count')?.value)   || 0;
    const washing  = parseInt(document.getElementById('plate-washing-count')?.value) || 0;
    const coating  = parseInt(document.getElementById('plate-coating-count')?.value) || 0;
    const clean    = parseInt(document.getElementById('plate-clean-count')?.value)   || 0;
    const distSum  = stock + washing + coating + clean;

    if (total === 0) {
        hint.textContent = 'Toplam adet girin';
        hint.className = 'add-dist-hint';
        return;
    }
    if (distSum > total) {
        hint.textContent = `Fazla! ${distSum} / ${total} — ${distSum - total} adet fazla`;
        hint.className = 'add-dist-hint warning';
        return;
    }
    const remaining = total - distSum;
    if (distSum === 0) {
        hint.textContent = `Tümü (${total} adet) stoka eklenecek`;
        hint.className = 'add-dist-hint valid';
    } else if (remaining > 0) {
        hint.textContent = `Kalan ${remaining} adet stoka eklenecek · Toplam: ${total}`;
        hint.className = 'add-dist-hint valid';
    } else {
        hint.textContent = `Dağılım tam: ${total} adet`;
        hint.className = 'add-dist-hint valid';
    }
}

function renderAll() {
    renderDashboard();
    renderPlates();
    renderTypeSummaryCards();
    renderTabCounts();
}

function renderTypeSummaryCards() {
    const container = document.getElementById('type-summary-cards');
    if (!container) return;

    const typeMap = {};
    appState.plates.forEach(p => {
        if (!typeMap[p.type]) typeMap[p.type] = { stock: 0, washing: 0, coating: 0, clean: 0 };
        typeMap[p.type].stock += p.stockCount;
        typeMap[p.type].washing += p.washingCount;
        typeMap[p.type].coating += p.coatingCount;
        typeMap[p.type].clean += (p.cleanCount || 0);
    });

    if (Object.keys(typeMap).length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = Object.entries(typeMap).map(([type, c]) => {
        const total = c.stock + c.washing + c.coating + c.clean;
        const sub = [];
        if (c.stock > 0) sub.push(`<span style="color:#059669;">▪ ${c.stock} stokta</span>`);
        if (c.washing > 0) sub.push(`<span style="color:#ea580c;">▪ ${c.washing} yıkamada</span>`);
        if (c.coating > 0) sub.push(`<span style="color:#2563eb;">▪ ${c.coating} kaplamada</span>`);
        if (c.clean > 0) sub.push(`<span style="color:#9333ea;">▪ ${c.clean} temiz</span>`);
        return `
            <div class="type-summary-card" onclick="openTypeModal('${type.replace(/'/g, "\\'")}')">
                <div class="type-card-label">${type}</div>
                <div class="type-card-count">${total}</div>
                <div class="type-card-sub">${sub.join('') || '<span>Hareket yok</span>'}</div>
            </div>`;
    }).join('');
}

function renderTabCounts() {
    const plates = appState.plates;
    const counts = {
        all:     plates.reduce((s, p) => s + (p.totalCount || 0), 0),
        stock:   plates.reduce((s, p) => s + (p.stockCount || 0), 0),
        washing: plates.reduce((s, p) => s + (p.washingCount || 0), 0),
        coating: plates.reduce((s, p) => s + (p.coatingCount || 0), 0)
    };
    Object.entries(counts).forEach(([key, val]) => {
        const el = document.getElementById(`tab-count-${key}`);
        if (el) el.textContent = val;
    });
}

window.setPlateTab = function(status) {
    currentPlateTab = status;
    document.querySelectorAll('.plate-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });
    renderPlates(document.getElementById('search-plate')?.value.toLowerCase() || '');
};

window.openMovement = function(plateId, movementType) {
    const plate = appState.plates.find(p => p.id === plateId);
    if (!plate) return;

    const modal = document.getElementById('movement-modal');
    const iconEl = document.getElementById('movement-modal-icon');
    const titleEl = document.getElementById('movement-modal-title');
    const plateInfoEl = document.getElementById('movement-plate-info');
    const labelEl = document.getElementById('movement-stepper-label');
    const hintEl = document.getElementById('movement-max-hint');
    const countInput = document.getElementById('movement-count');

    document.getElementById('movement-plate-id').value = plateId;
    document.getElementById('movement-type').value = movementType;

    const configs = {
        toWashing:   { max: plate.stockCount,         title: 'Yıkamaya Gönder',        icon: 'bx-droplet',      color: '#f59e0b', bg: '#fff7ed', label: 'Yıkamaya gönderilecek adet' },
        toCoating:   { max: plate.stockCount,         title: 'Kaplamaya Gönder',        icon: 'bx-layer-plus',   color: '#3b82f6', bg: '#eff6ff', label: 'Kaplamaya gönderilecek adet' },
        toClean:     { max: plate.stockCount,         title: 'Baskısız Temize Ayır',    icon: 'bx-check-circle', color: '#9333ea', bg: '#faf5ff', label: 'Baskısız temiz olarak ayrılacak adet' },
        fromWashing: { max: plate.washingCount || 0,  title: 'Yıkamadan Stoka Geri Al', icon: 'bx-revision',     color: '#f59e0b', bg: '#fff7ed', label: 'Stoka döndürülecek adet' },
        fromCoating: { max: plate.coatingCount || 0,  title: 'Kaplamadan Stoka Geri Al',icon: 'bx-revision',     color: '#3b82f6', bg: '#eff6ff', label: 'Stoka döndürülecek adet' },
        fromClean:   { max: plate.cleanCount || 0,    title: 'Temizden Stoka Geri Al',  icon: 'bx-revision',     color: '#9333ea', bg: '#faf5ff', label: 'Stoka döndürülecek adet' }
    };

    const cfg = configs[movementType];
    if (!cfg) return;

    if (cfg.max === 0) {
        showToast('Bu işlem için uygun adet bulunmuyor.', 'warning');
        return;
    }

    iconEl.innerHTML = `<i class='bx ${cfg.icon}' style="color:${cfg.color};font-size:20px;"></i>`;
    iconEl.style.cssText = `background:${cfg.bg};width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;`;
    titleEl.textContent = cfg.title;
    plateInfoEl.innerHTML = `<strong>${plate.name}</strong> — ${plate.type}, ${plate.inch}`;
    labelEl.textContent = cfg.label;
    hintEl.textContent = `Maksimum: ${cfg.max} adet`;
    countInput.value = 1;
    countInput.max = cfg.max;

    modal.classList.add('active');
};

function confirmMovement() {
    const plateId = document.getElementById('movement-plate-id').value;
    const movementType = document.getElementById('movement-type').value;
    const count = parseInt(document.getElementById('movement-count').value);
    const plate = appState.plates.find(p => p.id === plateId);
    if (!plate || isNaN(count) || count < 1) { showToast('Geçerli bir adet giriniz.', 'warning'); return; }

    const actions = {
        toWashing:   () => { if (count > plate.stockCount) return false; plate.stockCount -= count; plate.washingCount = (plate.washingCount || 0) + count; logActivity(`${plate.name}: ${count} adet yıkamaya gönderildi`, 'update'); return true; },
        toCoating:   () => { if (count > plate.stockCount) return false; plate.stockCount -= count; plate.coatingCount = (plate.coatingCount || 0) + count; logActivity(`${plate.name}: ${count} adet kaplamaya gönderildi`, 'update'); return true; },
        toClean:     () => { if (count > plate.stockCount) return false; plate.stockCount -= count; plate.cleanCount = (plate.cleanCount || 0) + count; logActivity(`${plate.name}: ${count} adet baskısız temize ayrıldı`, 'update'); return true; },
        fromWashing: () => { if (count > (plate.washingCount || 0)) return false; plate.washingCount -= count; plate.stockCount += count; logActivity(`${plate.name}: ${count} adet yıkamadan stoka döndü`, 'update'); return true; },
        fromCoating: () => { if (count > (plate.coatingCount || 0)) return false; plate.coatingCount -= count; plate.stockCount += count; logActivity(`${plate.name}: ${count} adet kaplamadan stoka döndü`, 'update'); return true; },
        fromClean:   () => { if (count > (plate.cleanCount || 0)) return false; plate.cleanCount -= count; plate.stockCount += count; logActivity(`${plate.name}: ${count} adet temizden stoka döndü`, 'update'); return true; }
    };

    const action = actions[movementType];
    if (!action) return;
    const ok = action();
    if (!ok) { showToast('Stok yetersiz.', 'warning'); return; }

    saveData();
    document.getElementById('movement-modal').classList.remove('active');
    showToast('Hareket başarıyla kaydedildi.', 'success');
    renderAll();
}

function renderDashboard() {
    const plates = appState.plates;
    const total   = plates.reduce((s, p) => s + p.totalCount, 0);
    const stock   = plates.reduce((s, p) => s + (p.stockCount || 0), 0);
    const washing = plates.reduce((s, p) => s + (p.washingCount || 0), 0);
    const coating = plates.reduce((s, p) => s + (p.coatingCount || 0), 0);
    const clean   = plates.reduce((s, p) => s + (p.cleanCount || 0), 0);

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-stock').textContent = stock;
    document.getElementById('stat-washing').textContent = washing;
    document.getElementById('stat-coating').textContent = coating;
    const statClean = document.getElementById('stat-clean');
    if (statClean) statClean.textContent = clean;

    // Distribution Bars
    const maxVal = Math.max(total, 1);
    const stockQty   = stock;
    const washingQty = washing;
    const coatingQty = coating;
    const cleanQty   = clean;

    const distStock = document.getElementById('dist-stock');
    const distWashing = document.getElementById('dist-washing');
    const distCoating = document.getElementById('dist-coating');
    const distClean = document.getElementById('dist-clean');
    if (distStock) {
        distStock.textContent = stockQty;
        document.querySelector('.dist-bar-stock').style.width = ((stockQty / maxVal) * 100) + '%';
    }
    if (distWashing) {
        distWashing.textContent = washingQty;
        document.querySelector('.dist-bar-washing').style.width = ((washingQty / maxVal) * 100) + '%';
    }
    if (distCoating) {
        distCoating.textContent = coatingQty;
        document.querySelector('.dist-bar-coating').style.width = ((coatingQty / maxVal) * 100) + '%';
    }
    if (distClean) {
        distClean.textContent = cleanQty;
        const barClean = document.querySelector('.dist-bar-clean');
        if (barClean) barClean.style.width = ((cleanQty / maxVal) * 100) + '%';
    }

    // Render Activities
    activityList.innerHTML = '';

    if (appState.activities.length === 0) {
        activityList.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:1rem;">Henüz bir hareket bulunmuyor.</p>';
        return;
    }

    const PAGE_SIZE = 5;
    const currentPage = appState.activityPage || 0;
    const totalPages = Math.max(1, Math.ceil(appState.activities.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages - 1);
    appState.activityPage = safePage;

    const prevBtn = document.getElementById('activity-prev');
    const nextBtn = document.getElementById('activity-next');
    const pageInfo = document.getElementById('activity-page-info');
    if (prevBtn) prevBtn.disabled = safePage === 0;
    if (nextBtn) nextBtn.disabled = safePage >= totalPages - 1;
    if (pageInfo) pageInfo.textContent = `${safePage + 1} / ${totalPages}`;

    const start = safePage * PAGE_SIZE;
    appState.activities.slice(start, start + PAGE_SIZE).forEach(act => {
        let icon = "<i class='bx bx-edit-alt'></i>";
        if (act.type === 'add') icon = "<i class='bx bx-plus-circle'></i>";
        if (act.message.includes('yıkama')) icon = "<i class='bx bx-water'></i>";
        if (act.message.includes('kaplama')) icon = "<i class='bx bx-layer-plus'></i>";

        const date = act.timestamp;

        const html = `
            <div class="activity-item">
                <div class="activity-icon">${icon}</div>
                <div class="activity-details">
                    <div class="activity-title">${act.message}</div>
                    <div class="activity-meta">
                        <span class="activity-time"><i class='bx bx-time-five'></i>${date}</span>
                        <span class="activity-user"><i class='bx bx-user'></i>${act.user}</span>
                    </div>
                </div>
            </div>
        `;
        activityList.insertAdjacentHTML('beforeend', html);
    });
}

function renderPlates(searchQuery = '') {
    plateTableBody.innerHTML = '';

    const typeFilter = document.getElementById('filter-type')?.value || '';
    const inchFilter = document.getElementById('filter-inch')?.value || '';

    let filtered = appState.plates.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(searchQuery) || p.type.toLowerCase().includes(searchQuery);
        const matchType = !typeFilter || p.type === typeFilter;
        const matchInch = !inchFilter || p.inch === inchFilter;
        return matchSearch && matchType && matchInch;
    });

    // Apply active tab filter
    if (currentPlateTab === 'stock') {
        filtered = filtered.filter(p => (p.stockCount || 0) > 0);
    } else if (currentPlateTab === 'washing') {
        filtered = filtered.filter(p => (p.washingCount || 0) > 0);
    } else if (currentPlateTab === 'coating') {
        filtered = filtered.filter(p => (p.coatingCount || 0) > 0);
    }

    if (filtered.length === 0) {
        plateTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem;">Kayıtlı kalıp bulunamadı.</td></tr>';
        return;
    }

    filtered.forEach(plate => {
        const hasImage = plate.image && plate.image.trim() !== '';

        // Eğer görsel yoksa, kırık resimleri yüklemeye çalışıp hataya düşmek yerine şık bir "Yok" kutusu göster:
        let imageHtml = '';
        if (hasImage) {
            imageHtml = `<img src="${getDisplayImageUrl(plate.image)}" class="plate-img-preview" alt="Kalıp" onclick="openImagePreview(this.src, '${plate.name.replace(/'/g, "\\'")}')" onerror="this.outerHTML='<div style=\\'width:40px;height:40px;background:#fef2f2;border:1px dashed #fca5a5;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#ef4444;text-align:center;line-height:1.2;font-weight:600;margin:0 auto;\\'>Bozuk<br>Kayıt</div>';">`;
        } else {
            imageHtml = `<div style="width:40px;height:40px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#94a3b8;text-align:center;line-height:1.2;font-weight:600;margin:0 auto;">Görsel<br>Yok</div>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="text-align:center;">${imageHtml}</td>
            <td><strong>${plate.name}</strong></td>
            <td>${plate.type}</td>
            <td>${plate.inch}</td>
            <td>${plate.size}</td>
            <td style="text-align:center;"><span style="background:#f1f5f9;color:#475569;padding:4px 8px;border-radius:6px;font-weight:600;font-size:12px;">${plate.totalCount} Adet</span></td>
            <td style="text-align:center;"><span class="status-badge status-stock">${plate.stockCount} Adet</span></td>
            <td style="text-align:center;">${plate.washingCount > 0 ? `<span style="background:#fff7ed;color:#ea580c;padding:4px 8px;border-radius:6px;font-weight:600;font-size:12px;">${plate.washingCount} Adet</span>` : '-'}</td>
            <td style="text-align:center;">${plate.coatingCount > 0 ? `<span style="background:#eff6ff;color:#2563eb;padding:4px 8px;border-radius:6px;font-weight:600;font-size:12px;">${plate.coatingCount} Adet</span>` : '-'}</td>
            <td>
                <div class="action-btns" style="justify-content: center;">
                    <button type="button" class="btn btn-primary" style="padding: 5px 10px; font-size: 13px;" onclick="editPlate('${plate.id}')" title="Düzenle">
                        <i class='bx bx-edit-alt'></i> Edit
                    </button>
                    ${(appState.currentUser && appState.currentUser.role !== 'operator') ? `<button type="button" class="btn btn-icon" style="color:var(--danger); font-size: 1.2rem; padding: 5px;" onclick="deletePlate('${plate.id}')"><i class='bx bx-trash'></i></button>` : ''}
                </div>
            </td>
        `;
        plateTableBody.appendChild(row);
    });
}

// Open Image Preview Modal
window.openImagePreview = function (imgSrc, plateName) {
    const modal = document.getElementById('image-preview-modal');
    const modalImg = document.getElementById('image-preview-modal-img');
    const titleEl = document.getElementById('image-preview-title');
    if (modal && modalImg) {
        modalImg.src = imgSrc;
        if (titleEl) titleEl.textContent = plateName || 'Kalıp Görseli';
        modal.classList.add('active');
    }
}

function logActivity(message, type) {
    const act = {
        id: Date.now(),
        message: message,
        type: type, // add, update, delete
        user: appState.currentUser ? appState.currentUser.username : 'Sistem',
        timestamp: nowFormatted()
    };
    appState.activities.unshift(act);
    if (appState.activities.length > 20) appState.activities.pop();
}

// User Management Functions
function handleUserForm(e) {
    e.preventDefault();
    if (appState.currentUser.role !== 'superadmin') return;

    const editId = document.getElementById('edit-user-id').value;
    const username = document.getElementById('form-username').value.trim();
    const password = document.getElementById('form-password').value.trim();
    const role = document.getElementById('form-role').value;

    const pageCheckboxes = document.querySelectorAll('input[name="user-pages"]:checked');
    const permissions = Array.from(pageCheckboxes).map(cb => cb.value);

    if (editId) {
        const user = appState.users.find(u => u.id === editId);
        if (user) {
            user.username = username;
            user.password = password;
            user.role = role;
            user.permissions = permissions;
            logActivity(`${username} kullanıcısı güncellendi.`, 'update');
        }
    } else {
        if (appState.users.find(u => u.username === username)) {
            showToast('Bu kullanıcı adı zaten mevcut!', 'warning');
            return;
        }
        const newUser = {
            id: 'U' + Date.now(),
            username,
            password,
            role,
            permissions
        };
        appState.users.push(newUser);
        logActivity(`Yeni kullanıcı eklendi: ${username}`, 'add');
    }

    saveData();
    userModal.classList.remove('active');
    renderUsers();
}

function renderUsers() {
    userTableBody.innerHTML = '';
    appState.users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${user.username}</strong></td>
            <td>${user.role}</td>
            <td>${user.permissions.join(', ')}</td>
            <td>
                <div class="action-btns">
                    <button class="btn btn-secondary btn-sm" onclick="editUser('${user.id}')"><i class='bx bx-edit'></i> Düzenle</button>
                    ${user.username !== 'admin' ? `<button class="btn btn-icon" style="color:var(--danger)" onclick="deleteUser('${user.id}')"><i class='bx bx-trash'></i></button>` : ''}
                </div>
            </td>
        `;
        userTableBody.appendChild(row);
    });
}

window.editUser = function (id) {
    const user = appState.users.find(u => u.id === id);
    if (!user) return;
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('form-username').value = user.username;
    document.getElementById('form-password').value = user.password;
    document.getElementById('form-role').value = user.role;

    const pageCheckboxes = document.querySelectorAll('input[name="user-pages"]');
    pageCheckboxes.forEach(cb => {
        cb.checked = user.permissions.includes(cb.value);
    });

    document.getElementById('user-modal-title').textContent = 'Kullanıcı Düzenle';
    userModal.classList.add('active');
}

window.deleteUser = function (id) {
    const user = appState.users.find(u => u.id === id);
    if (!user) return;
    showConfirm({
        title: 'Kullanıcıyı Sil',
        message: `"${user.username}" kullanıcısı kalıcı olarak silinecek.`,
        confirmText: 'Sil',
        type: 'danger',
        icon: 'bx-user-x'
    }, () => {
        appState.users = appState.users.filter(u => u.id !== id);
        saveData();
        renderUsers();
        showToast(`"${user.username}" kullanıcısı silindi.`, 'info');
    });
}

// Delete Operation
window.deletePlate = function (id) {
    const plate = appState.plates.find(p => p.id === id);
    if (!plate) return;
    showConfirm({
        title: 'Kalıbı Sil',
        message: `"${plate.name}" (${plate.type}, ${plate.inch}) kalıcı olarak silinecek.`,
        confirmText: 'Sil',
        type: 'danger',
        icon: 'bx-trash'
    }, () => {
        appState.plates = appState.plates.filter(p => p.id !== id);
        logActivity(`${plate.name} sistemden silindi — ${plate.type}, ${plate.inch}`, 'delete');
        saveData();
        renderAll();
        showToast(`"${plate.name}" başarıyla silindi.`, 'info');
    });
}

async function syncCloudData() {
    if (!SCRIPT_URL) return;
    try {
        const res = await fetch(SCRIPT_URL + "?action=getData&t=" + Date.now());
        let data = await res.json();
        let actualData = data.status === 'success' && data.data ? data.data : data;

        if (actualData.plates) {
            appState.plates = actualData.plates || [];
            appState.activities = actualData.activities || [];
            appState.users = actualData.users || [];
            if (actualData.dropdowns) appState.dropdowns = actualData.dropdowns;

            checkAndSetDefaultDropdowns();

            // Sadece yönetici eklenecekse buluta da yazarız
            if (!appState.users || appState.users.length === 0) {
                appState.users = [{
                    id: 'U1',
                    username: 'admin',
                    password: '123',
                    role: 'superadmin',
                    permissions: ['dashboard', 'add-plate', 'plate-list']
                }];
                saveData();
            } else {
                // Buluttan yeni veri geldiyse yerel depolamayı (cache) sessizce güncelleriz
                localStorage.setItem('kalipTakipData', JSON.stringify({
                    plates: appState.plates,
                    activities: appState.activities,
                    users: appState.users,
                    dropdowns: appState.dropdowns
                }));
            }

            // Yükleme bittikten sonra sayfa halihazırda açıksa sessizce tabloları yenile
            if (appState.currentUser) {
                renderDropdowns();
                renderAll();
            }
        }
    } catch (e) {
        console.error("Sheets bulut verisi alınamadı, mevcut önbellek kullanılmaya devam edilecek.", e);
    }
}

function loadLocal() {
    const saved = localStorage.getItem('kalipTakipData');
    if (saved) {
        const parsed = JSON.parse(saved);
        appState.plates = parsed.plates || [];
        appState.activities = parsed.activities || [];
        appState.users = parsed.users || [];
        appState.dropdowns = parsed.dropdowns || null;
    } else {
        // Dummy data for visual
        appState.plates = [
            { id: 'p1', image: '', name: 'Örnek Baskı A', type: 'Trikromi', inch: '12', size: '50x70', totalCount: 5, stockCount: 3, washingCount: 2, coatingCount: 0, cleanCount: 0 },
            { id: 'p2', image: '', name: 'Örnek Baskı B', type: 'Zemin', inch: '10', size: '40x60', totalCount: 10, stockCount: 8, washingCount: 0, coatingCount: 2, cleanCount: 0 }
        ];
        logActivity('Sistem başlatıldı, örnek veriler yüklendi.', 'add');
    }

    checkAndSetDefaultDropdowns();
    renderDropdowns();

    if (!appState.users || appState.users.length === 0) {
        appState.users = [{
            id: 'U1',
            username: 'admin',
            password: '123',
            role: 'superadmin',
            permissions: ['dashboard', 'add-plate', 'plate-list']
        }];
    }
}

function checkAndSetDefaultDropdowns() {
    if (!appState.dropdowns || !appState.dropdowns.types || appState.dropdowns.types.length === 0) {
        appState.dropdowns = {
            types: ["Trikromi", "Tire", "Zemin", "Tepe"],
            inches: ["12\"", "18\"", "24\" & 36\"", "KALP"],
            sizes: ["(23x31)", "(23x36)", "(52x60)", "(67.5x81.5)", "(34x49)"]
        };
    } else {
        // Eksik olan yeni mapping değerlerini dropdown'a ekle
        const newSizes = ["(23x31)", "(23x36)", "(52x60)", "(67.5x81.5)", "(34x49)"];
        newSizes.forEach(s => {
            if (appState.dropdowns.sizes && !appState.dropdowns.sizes.includes(s)) {
                appState.dropdowns.sizes.push(s);
            }
        });

        const newInches = ["12\"", "18\"", "24\" & 36\"", "KALP"];
        newInches.forEach(i => {
            if (appState.dropdowns.inches && !appState.dropdowns.inches.includes(i)) {
                appState.dropdowns.inches.push(i);
            }
        });
    }
}

function renderDropdowns() {
    let typeSelect = document.getElementById('plate-type');
    let inchSelect = document.getElementById('plate-inch');
    let sizeSelect = document.getElementById('plate-size');

    let editTypeSelect = document.getElementById('edit-plate-type');
    let editInchSelect = document.getElementById('edit-plate-inch');
    let editSizeSelect = document.getElementById('edit-plate-size');

    // HTML Cache Busting (If browser cached the old index.html where these were input tags)
    [typeSelect, inchSelect, sizeSelect].forEach(el => {
        if (el && el.tagName === 'INPUT') {
            const sel = document.createElement('select');
            sel.id = el.id;
            sel.required = el.required;
            el.parentNode.replaceChild(sel, el);
            if (el.id === 'plate-type') typeSelect = sel;
            if (el.id === 'plate-inch') inchSelect = sel;
            if (el.id === 'plate-size') sizeSelect = sel;
        }
    });

    if (!typeSelect || !inchSelect || !sizeSelect) return;

    typeSelect.innerHTML = '<option value="">Seçiniz</option>';
    inchSelect.innerHTML = '<option value="">Seçiniz</option>';
    sizeSelect.innerHTML = '<option value="">Seçiniz</option>';

    if (editTypeSelect) editTypeSelect.innerHTML = '<option value="">Seçiniz</option>';
    if (editInchSelect) editInchSelect.innerHTML = '<option value="">Seçiniz</option>';
    if (editSizeSelect) editSizeSelect.innerHTML = '<option value="">Seçiniz</option>';

    appState.dropdowns.types.forEach(val => {
        const opt = document.createElement('option'); opt.value = val; opt.textContent = val;
        typeSelect.appendChild(opt);
        if (editTypeSelect) { const opt2 = document.createElement('option'); opt2.value = val; opt2.textContent = val; editTypeSelect.appendChild(opt2); }
    });
    appState.dropdowns.inches.forEach(val => {
        const opt = document.createElement('option'); opt.value = val; opt.textContent = val;
        inchSelect.appendChild(opt);
        if (editInchSelect) { const opt2 = document.createElement('option'); opt2.value = val; opt2.textContent = val; editInchSelect.appendChild(opt2); }
    });
    appState.dropdowns.sizes.forEach(val => {
        const opt = document.createElement('option'); opt.value = val; opt.textContent = val;
        sizeSelect.appendChild(opt);
        if (editSizeSelect) { const opt2 = document.createElement('option'); opt2.value = val; opt2.textContent = val; editSizeSelect.appendChild(opt2); }
    });

    // Plate list filter dropdowns
    const filterType = document.getElementById('filter-type');
    const filterInch = document.getElementById('filter-inch');
    if (filterType) {
        const cur = filterType.value;
        filterType.innerHTML = '<option value="">Tüm Türler</option>';
        appState.dropdowns.types.forEach(val => {
            const o = document.createElement('option'); o.value = val; o.textContent = val;
            filterType.appendChild(o);
        });
        filterType.value = cur;
    }
    if (filterInch) {
        const cur = filterInch.value;
        filterInch.innerHTML = '<option value="">Tüm İnçler</option>';
        appState.dropdowns.inches.forEach(val => {
            const o = document.createElement('option'); o.value = val; o.textContent = val;
            filterInch.appendChild(o);
        });
        filterInch.value = cur;
    }
}

function saveData() {
    // LocalStorage Always Save immediately
    localStorage.setItem('kalipTakipData', JSON.stringify({
        plates: appState.plates,
        activities: appState.activities,
        users: appState.users,
        dropdowns: appState.dropdowns
    }));

    if (SCRIPT_URL) {
        // Send to Google Sheets Via POST without awaiting, avoiding UI freeze
        fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'saveData',
                plates: appState.plates,
                activities: appState.activities,
                users: appState.users
            })
        }).then(() => {
            // Google App Script processes in the background, we do not syncCloudData() here
            // because Apps script takes 2-3 seconds to run and immediate sync would fetch old data.
            console.log("Veriler arka planda Google Sheets'e gönderildi.");
        }).catch(e => {
            console.error("Sheets kaydetme hatası", e);
        });
    }
}

// --- Google Drive Image Upload Helpers ---
function handleImageSelection(fileInputId, previewId, hiddenInputId, placeholderId) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput) return;

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const preview = document.getElementById(previewId);
        const hiddenInput = document.getElementById(hiddenInputId);
        const placeholder = document.getElementById(placeholderId);

        const reader = new FileReader();
        reader.onload = () => {
            // Frontend base64 olarak depolarken Google Sheets hücre sınırını aşmamak için resmi küçültüyoruz
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const max_size = 600; // Görsel kalitesi için artırıldı

                if (width > height && width > max_size) {
                    height *= max_size / width;
                    width = max_size;
                } else if (height > max_size) {
                    width *= max_size / height;
                    height = max_size;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

                hiddenInput.value = dataUrl;
                preview.src = dataUrl;
                preview.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
            };
            img.src = reader.result;
        }
        reader.readAsDataURL(file);
    });
}

// ============ DATE HELPER ============
function nowFormatted() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ============ TOAST & CONFIRM ============

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: 'bx-check-circle', error: 'bx-x-circle', warning: 'bx-error', info: 'bx-info-circle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class='bx ${icons[type] || icons.info} toast-icon'></i>
        <span class="toast-msg">${message}</span>
        <button class="toast-close" onclick="this.closest('.toast').classList.add('toast-out'); setTimeout(()=>this.closest('.toast')?.remove(),300)">
            <i class='bx bx-x'></i>
        </button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showConfirm({ title = 'Emin misiniz?', message = '', confirmText = 'Evet', type = 'danger', icon = 'bx-trash' }, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const iconWrap = document.getElementById('confirm-icon-wrap');
    const iconEl = document.getElementById('confirm-icon');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    if (!modal) return;

    iconWrap.className = `confirm-icon-wrap ${type}`;
    iconEl.className = `bx ${icon}`;
    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = confirmText;
    okBtn.className = `btn btn-${type}`;
    modal.classList.add('active');

    const newOk = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    okBtn.replaceWith(newOk);
    cancelBtn.replaceWith(newCancel);

    const close = () => modal.classList.remove('active');
    newOk.addEventListener('click', () => { close(); onConfirm(); });
    newCancel.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });
}

// ============ DASHBOARD FILTER MODAL ============
let currentDfmFilter = 'all';
let currentDfmTypeFilter = '';

const dfmTitleMap = {
    'all': 'Tüm Kalıplar',
    'stock': 'Stoktaki Kalıplar',
    'washing': 'Yıkamadaki Kalıplar',
    'coating': 'Kaplamadaki Kalıplar',
    'clean': 'Baskısız Temiz Kalıplar'
};

const dfmIconMap = {
    'all': '<i class="bx bx-package" style="color:#4318FF;"></i>',
    'stock': '<i class="bx bx-check-shield" style="color:#01B574;"></i>',
    'washing': '<i class="bx bx-water" style="color:#FFB547;"></i>',
    'coating': '<i class="bx bx-layer-plus" style="color:#4318FF;"></i>',
    'clean': '<i class="bx bx-check-circle" style="color:#9333ea;"></i>'
};

const dfmIconBgMap = {
    'all': 'background:rgba(67,24,255,0.08);',
    'stock': 'background:rgba(1,181,116,0.08);',
    'washing': 'background:rgba(255,181,71,0.08);',
    'coating': 'background:rgba(67,24,255,0.08);',
    'clean': 'background:rgba(147,51,234,0.08);'
};

const dfmHeaderMap = {
    'all':     '',
    'stock':   '<tr><th>Baskı Adı</th><th>Tür</th><th>İnç</th><th style="text-align:center;">Stokta</th></tr>',
    'washing': '<tr><th>Baskı Adı</th><th>Tür</th><th>İnç</th><th style="text-align:center;">Yıkamada</th></tr>',
    'coating': '<tr><th>Baskı Adı</th><th>Tür</th><th>İnç</th><th style="text-align:center;">Kaplamada</th></tr>',
    'clean':   '<tr><th>Baskı Adı</th><th>Tür</th><th>İnç</th><th style="text-align:center;">Baskısız Temiz</th></tr>'
};

function openDashboardFilterModal(filter) {
    currentDfmFilter = filter || 'all';
    currentDfmTypeFilter = '';
    openDfmModal(dfmTitleMap[currentDfmFilter] || 'Kalıplar', dfmIconMap[currentDfmFilter], dfmIconBgMap[currentDfmFilter]);
}

window.openTypeModal = function(typeName) {
    currentDfmFilter = 'all';
    currentDfmTypeFilter = typeName;
    openDfmModal(typeName, '<i class="bx bx-category" style="color:#4318FF;"></i>', 'background:rgba(67,24,255,0.08);');
};

function openDfmModal(titleText, iconHtml, iconBg) {
    const modal = document.getElementById('dashboard-filter-modal');
    const title = document.getElementById('dfm-title');
    const icon = document.getElementById('dfm-icon');
    const thead = document.getElementById('dfm-thead');
    const searchInput = document.getElementById('dfm-search');
    if (!modal) return;

    title.textContent = titleText;
    icon.innerHTML = iconHtml;
    icon.style = iconBg;
    if (thead) thead.innerHTML = dfmHeaderMap[currentDfmFilter] || '';
    if (searchInput) searchInput.value = '';

    renderDfmTable('');
    modal.classList.add('active');
}

function renderDfmTable(searchQuery) {
    const tbody = document.getElementById('dfm-table-body');
    const thead = document.getElementById('dfm-thead');
    const summary = document.getElementById('dfm-summary');
    if (!tbody) return;

    let filtered = appState.plates.slice();

    if (currentDfmTypeFilter) filtered = filtered.filter(p => p.type === currentDfmTypeFilter);
    if (currentDfmFilter === 'stock')   filtered = filtered.filter(p => p.stockCount > 0);
    else if (currentDfmFilter === 'washing') filtered = filtered.filter(p => p.washingCount > 0);
    else if (currentDfmFilter === 'coating') filtered = filtered.filter(p => p.coatingCount > 0);
    else if (currentDfmFilter === 'clean')   filtered = filtered.filter(p => (p.cleanCount || 0) > 0);

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q));
    }

    const totalQtyShown = filtered.reduce((s, p) => s + p.totalCount, 0);
    if (summary) summary.textContent = `${filtered.length} kalıp varyantı · ${totalQtyShown} adet toplam kalıp`;

    if (filtered.length === 0) {
        if (thead) thead.innerHTML = '';
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted);">Kalıp bulunamadı.</td></tr>`;
        return;
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    // ── 'all' filtresi: düz tablo — her kalıp ayrı satır, baskı adı + tür birlikte ──
    if (currentDfmFilter === 'all') {
        if (thead) thead.innerHTML = `<tr>
            <th>Baskı Adı</th>
            <th>Kalıp Türü</th>
            <th>İnç</th>
            <th style="text-align:center;">Toplam</th>
            <th style="text-align:center;">Stokta</th>
            <th style="text-align:center;">Yıkamada</th>
            <th style="text-align:center;">Kaplamada</th>
        </tr>`;

        const badge = (val, bg, color) =>
            val > 0 ? `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:5px;font-weight:600;font-size:12px;">${val}</span>` : `<span style="color:#c4cad8;">—</span>`;

        tbody.innerHTML = filtered.map(p => `
            <tr>
                <td><strong>${p.name}</strong></td>
                <td><span style="background:var(--primary-light);color:var(--primary);padding:2px 8px;border-radius:5px;font-size:12px;font-weight:600;">${p.type}</span></td>
                <td>${p.inch}</td>
                <td style="text-align:center;">${badge(p.totalCount, '#f1f5f9', '#475569')}</td>
                <td style="text-align:center;">${badge(p.stockCount || 0, '#ecfdf5', '#059669')}</td>
                <td style="text-align:center;">${badge(p.washingCount || 0, '#fff7ed', '#ea580c')}</td>
                <td style="text-align:center;">${badge(p.coatingCount || 0, '#eff6ff', '#2563eb')}</td>
            </tr>`).join('');
        return;
    }

    // ── Diğer filtreler: tablo görünümü ──
    if (thead) thead.innerHTML = dfmHeaderMap[currentDfmFilter] || '';

    const badge = (val, bg, color) =>
        `<span style="background:${bg};color:${color};padding:3px 10px;border-radius:6px;font-weight:600;font-size:13px;">${val}</span>`;

    tbody.innerHTML = filtered.map(p => {
        let cell = '';
        if (currentDfmFilter === 'stock')   cell = `<td style="text-align:center;">${badge(p.stockCount,         '#ecfdf5','#059669')}</td>`;
        if (currentDfmFilter === 'washing') cell = `<td style="text-align:center;">${badge(p.washingCount,       '#fff7ed','#ea580c')}</td>`;
        if (currentDfmFilter === 'coating') cell = `<td style="text-align:center;">${badge(p.coatingCount,       '#eff6ff','#2563eb')}</td>`;
        if (currentDfmFilter === 'clean')   cell = `<td style="text-align:center;">${badge(p.cleanCount || 0,    '#faf5ff','#9333ea')}</td>`;
        return `<tr><td><strong>${p.name}</strong></td><td>${p.type}</td><td>${p.inch}</td>${cell}</tr>`;
    }).join('');
}

function filterDfmList(value) {
    renderDfmTable(value);
}
