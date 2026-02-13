// Firebase Configuration
var firebaseConfig = {
    apiKey: "AIzaSyC9L6qq-_pl_jjmPAK5a4iO8rL6Zu13JN4",
    authDomain: "character-sheet-app-6803e.firebaseapp.com",
    projectId: "character-sheet-app-6803e",
    storageBucket: "character-sheet-app-6803e.firebasestorage.app",
    messagingSenderId: "360308222227",
    appId: "1:360308222227:web:97e06b4e0eec72f87012e6"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db = firebase.firestore();

var currentUser = null;
var currentMonster = null;
var currentMonsterDocId = null;
var groups = [];
var monsters = [];
var expandedGroups = new Set(); // Track which groups are expanded (all start collapsed)

// Custom modal functions
function showModal(message, buttons) {
    var overlay = document.getElementById('custom-modal');
    var msgEl = document.getElementById('modal-message');
    var btnRow = document.getElementById('modal-buttons');
    msgEl.textContent = message;
    btnRow.innerHTML = '';
    buttons.forEach(function(btn) {
        var b = document.createElement('button');
        b.textContent = btn.text;
        b.className = 'modal-btn ' + (btn.className || '');
        b.addEventListener('click', function() {
            overlay.style.display = 'none';
            if (btn.onClick) btn.onClick();
        });
        btnRow.appendChild(b);
    });
    overlay.style.display = 'flex';
}

function showAlert(message) {
    showModal(message, [{ text: 'OK', className: 'modal-btn-confirm' }]);
}

function showConfirm(message, onConfirm) {
    showModal(message, [
        { text: 'Cancel', className: 'modal-btn-cancel' },
        { text: 'OK', className: 'modal-btn-confirm', onClick: onConfirm }
    ]);
}

// Attach the file upload listener once on page load
document.getElementById("json-upload").addEventListener("change", handleFileUpload);

// Export Template - downloads a zip-like pair of files
document.getElementById("export-template-btn").addEventListener("click", exportTemplate);

// Auth State Listener
auth.onAuthStateChanged(function(user) {
    if (user) {
        currentUser = user;
        document.getElementById("login-btn").style.display = "none";
        document.getElementById("user-info").style.display = "flex";
        document.getElementById("user-name").textContent = user.displayName;
        document.getElementById("saved-monsters").style.display = "block";
        loadGroupsAndMonsters();
        
        // Auto-load last opened monster
        var lastDocId = localStorage.getItem('lastMonsterDocId');
        if (lastDocId) {
            loadMonster(lastDocId);
        }
    } else {
        currentUser = null;
        document.getElementById("login-btn").style.display = "inline-block";
        document.getElementById("user-info").style.display = "none";
        document.getElementById("saved-monsters").style.display = "none";
        document.getElementById("monster-list").innerHTML = "";
    }
});

// Login
document.getElementById("login-btn").addEventListener("click", function() {
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(function(error) {
        console.error("Login error:", error);
        showAlert("Login failed: " + error.message);
    });
});

// Logout
document.getElementById("logout-btn").addEventListener("click", function() {
    auth.signOut();
});

// New Group Button
document.getElementById("new-group-btn").addEventListener("click", function() {
    var groupName = prompt("Enter group name:");
    if (groupName && groupName.trim()) {
        createGroup(groupName.trim());
    }
});

// Create Group
function createGroup(name) {
    if (!currentUser) return;
    
    db.collection("users").doc(currentUser.uid).collection("groups")
        .add({ name: name })
        .then(function() {
            loadGroupsAndMonsters();
        })
        .catch(function(error) {
            console.error("Error creating group:", error);
        });
}

// Delete Group
function deleteGroup(groupId) {
    showConfirm("Delete this group? Monsters will be moved to ungrouped.", function() {
        expandedGroups.delete(groupId);
        
        db.collection("users").doc(currentUser.uid).collection("monsters")
            .where("groupId", "==", groupId)
            .get()
            .then(function(querySnapshot) {
                var batch = db.batch();
                querySnapshot.forEach(function(doc) {
                    batch.update(doc.ref, { groupId: null });
                });
                return batch.commit();
            })
            .then(function() {
                return db.collection("users").doc(currentUser.uid).collection("groups").doc(groupId).delete();
            })
            .then(function() {
                loadGroupsAndMonsters();
            })
            .catch(function(error) {
                console.error("Error deleting group:", error);
            });
    });
}

// Toggle Group Collapse
function toggleGroup(groupId) {
    if (expandedGroups.has(groupId)) {
        expandedGroups.delete(groupId);
    } else {
        expandedGroups.add(groupId);
    }
    
    var groupDiv = document.querySelector('.monster-group[data-group-id="' + groupId + '"]');
    var monstersDiv = groupDiv.querySelector('.group-monsters');
    var toggle = groupDiv.querySelector('.group-toggle');
    
    if (expandedGroups.has(groupId)) {
        monstersDiv.classList.remove('collapsed');
        toggle.textContent = '▼';
    } else {
        monstersDiv.classList.add('collapsed');
        toggle.textContent = '►';
    }
}

// Load Groups and Monsters
function loadGroupsAndMonsters() {
    if (!currentUser) return;
    
    db.collection("users").doc(currentUser.uid).collection("groups")
        .orderBy("name")
        .get()
        .then(function(groupSnapshot) {
            groups = [];
            groupSnapshot.forEach(function(doc) {
                groups.push({ id: doc.id, ...doc.data() });
            });
            
            return db.collection("users").doc(currentUser.uid).collection("monsters")
                .orderBy("name")
                .get();
        })
        .then(function(monsterSnapshot) {
            monsters = [];
            monsterSnapshot.forEach(function(doc) {
                monsters.push({ id: doc.id, ...doc.data() });
            });
            
            renderMonsterList();
        })
        .catch(function(error) {
            console.error("Error loading data:", error);
        });
}

// Render Monster List - groups start collapsed, respects expandedGroups state
function renderMonsterList() {
    var container = document.getElementById("monster-list");
    var html = '';
    
    groups.forEach(function(group) {
        var groupMonsters = monsters.filter(function(m) { return m.groupId === group.id; });
        var isExpanded = expandedGroups.has(group.id);
        
        html += '<div class="monster-group" data-group-id="' + group.id + '">';
        html += '<div class="group-header" onclick="toggleGroup(\'' + group.id + '\')">';
        html += '<span class="group-toggle">' + (isExpanded ? '▼' : '►') + '</span>';
        html += '<span class="group-name">' + group.name + '</span>';
        html += '<button class="group-delete" onclick="event.stopPropagation(); deleteGroup(\'' + group.id + '\')">X</button>';
        html += '</div>';
        html += '<div class="group-monsters' + (isExpanded ? '' : ' collapsed') + '" data-group-id="' + group.id + '">';
        
        groupMonsters.forEach(function(monster) {
            html += renderMonsterItem(monster);
        });
        
        html += '</div></div>';
    });
    
    var ungroupedMonsters = monsters.filter(function(m) { return !m.groupId; });
    
    html += '<div class="ungrouped-section">';
    html += '<div class="ungrouped-header">Ungrouped</div>';
    html += '<div class="ungrouped-monsters" data-group-id="ungrouped">';
    
    ungroupedMonsters.forEach(function(monster) {
        html += renderMonsterItem(monster);
    });
    
    html += '</div></div>';
    
    container.innerHTML = html;
    
    setupDragAndDrop();
}

// Render Monster Item
function renderMonsterItem(monster) {
    var html = '<div class="monster-item" draggable="true" data-monster-id="' + monster.id + '">';
    html += '<button class="monster-name-btn" onclick="loadMonster(\'' + monster.id + '\')">' + monster.name + '</button>';
    html += '<button class="delete-btn" onclick="event.stopPropagation(); deleteMonster(\'' + monster.id + '\', \'' + monster.name.replace(/'/g, "\\'") + '\')">X</button>';
    html += '</div>';
    return html;
}

// Setup Drag and Drop
function setupDragAndDrop() {
    var monsterItems = document.querySelectorAll('.monster-item');
    var dropZones = document.querySelectorAll('.group-monsters, .ungrouped-monsters');
    var groupHeaders = document.querySelectorAll('.group-header');
    
    monsterItems.forEach(function(item) {
        item.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', item.dataset.monsterId);
            item.classList.add('dragging');
        });
        
        item.addEventListener('dragend', function(e) {
            item.classList.remove('dragging');
            dropZones.forEach(function(zone) {
                zone.classList.remove('drag-over');
            });
            groupHeaders.forEach(function(header) {
                header.classList.remove('drag-over');
            });
        });
    });
    
    dropZones.forEach(function(zone) {
        zone.addEventListener('dragover', function(e) {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', function(e) {
            zone.classList.remove('drag-over');
        });
        
        zone.addEventListener('drop', function(e) {
            e.preventDefault();
            zone.classList.remove('drag-over');
            
            var monsterId = e.dataTransfer.getData('text/plain');
            var newGroupId = zone.dataset.groupId;
            
            if (newGroupId === 'ungrouped') {
                newGroupId = null;
            }
            
            moveMonsterToGroup(monsterId, newGroupId);
        });
    });
    
    // Group headers are also drop targets (for collapsed groups)
    groupHeaders.forEach(function(header) {
        header.addEventListener('dragover', function(e) {
            e.preventDefault();
            header.classList.add('drag-over');
        });
        
        header.addEventListener('dragleave', function(e) {
            header.classList.remove('drag-over');
        });
        
        header.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            header.classList.remove('drag-over');
            
            var monsterId = e.dataTransfer.getData('text/plain');
            var groupId = header.closest('.monster-group').dataset.groupId;
            
            moveMonsterToGroup(monsterId, groupId);
        });
    });
}

// Move Monster to Group
function moveMonsterToGroup(monsterId, groupId) {
    db.collection("users").doc(currentUser.uid).collection("monsters").doc(monsterId)
        .update({ groupId: groupId })
        .then(function() {
            loadGroupsAndMonsters();
        })
        .catch(function(error) {
            console.error("Error moving monster:", error);
        });
}

// Load a specific monster
function loadMonster(docId) {
    db.collection("users").doc(currentUser.uid).collection("monsters").doc(docId)
        .get()
        .then(function(doc) {
            if (doc.exists) {
                var monster = doc.data();
                currentMonster = monster;
                currentMonsterDocId = docId;
                localStorage.setItem('lastMonsterDocId', docId);
                renderStatBlock(monster);
            }
        })
        .catch(function(error) {
            console.error("Error loading monster:", error);
        });
}

// Save Monster
function saveMonster(monster) {
    if (!currentUser) {
        showAlert("Please sign in to save monsters.");
        return;
    }
    
    var monsterData = Object.assign({}, monster);
    monsterData.groupId = null;
    
    db.collection("users").doc(currentUser.uid).collection("monsters")
        .add(monsterData)
        .then(function(docRef) {
            currentMonsterDocId = docRef.id;
            localStorage.setItem('lastMonsterDocId', docRef.id);
            showAlert(monsterData.name + " saved!");
            loadGroupsAndMonsters();
        })
        .catch(function(error) {
            console.error("Error saving monster:", error);
            showAlert("Error saving monster: " + error.message);
        });
}

// Delete Monster
function deleteMonster(docId, name) {
    showConfirm("Delete " + name + "?", function() {
        db.collection("users").doc(currentUser.uid).collection("monsters").doc(docId)
            .delete()
            .then(function() {
                loadGroupsAndMonsters();
            })
            .catch(function(error) {
                console.error("Error deleting monster:", error);
            });
    });
}

// Create a consistent clone for printing - WORKS ON BOTH MOBILE AND DESKTOP
function createPrintClone() {
    var element = document.querySelector(".stat-block");
    var clone = element.cloneNode(true);
    
    var viewportMeta = document.querySelector('meta[name="viewport"]');
    var originalViewport = viewportMeta ? viewportMeta.getAttribute('content') : null;
    
    if (viewportMeta) {
        viewportMeta.setAttribute('content', 'width=1200');
    } else {
        viewportMeta = document.createElement('meta');
        viewportMeta.name = 'viewport';
        viewportMeta.content = 'width=1200';
        document.head.appendChild(viewportMeta);
    }
    
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;left:0;top:0;width:1000px;background:white;z-index:9999;overflow:visible;';
    
    // Force desktop two-column layout
    clone.style.cssText = 'display:block!important;width:850px!important;max-width:none!important;min-width:850px!important;column-count:2!important;column-gap:40px!important;column-rule:1px solid #184e4f!important;font-size:14px!important;padding:20px!important;background:#f5f5f5!important;border-top:4px solid #184e4f!important;border-bottom:4px solid #184e4f!important;box-shadow:none!important;box-sizing:border-box!important;overflow:visible!important;';
    
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);
    
    void clone.offsetWidth;
    void clone.offsetHeight;
    
    return { clone: clone, container: wrapper, viewportMeta: viewportMeta, originalViewport: originalViewport };
}

function cleanupPrintClone(printElements) {
    document.body.removeChild(printElements.container);
    if (printElements.originalViewport) {
        printElements.viewportMeta.setAttribute('content', printElements.originalViewport);
    }
}

// Print PDF
function printStatBlock() {
    if (!currentMonster) { showAlert("Please load a monster first."); return; }
    
    var printElements = createPrintClone();
    var filename = currentMonster.name.replace(/[^a-z0-9]/gi, '_') + ".pdf";
    
    setTimeout(function() {
        void printElements.clone.offsetWidth;
        var cloneHeight = printElements.clone.scrollHeight;
        
        var opt = {
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, width: 850, height: cloneHeight, scrollX: 0, scrollY: 0 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(printElements.clone).save().then(function() {
            cleanupPrintClone(printElements);
        }).catch(function(error) {
            console.error("PDF generation error:", error);
            cleanupPrintClone(printElements);
            showAlert("Error generating PDF. Please try again.");
        });
    }, 300);
}

// Print PNG
function printPNG() {
    if (!currentMonster) { showAlert("Please load a monster first."); return; }
    
    var printElements = createPrintClone();
    var filename = currentMonster.name.replace(/[^a-z0-9]/gi, '_') + ".png";
    
    setTimeout(function() {
        void printElements.clone.offsetWidth;
        var cloneHeight = printElements.clone.scrollHeight;
        
        html2canvas(printElements.clone, { scale: 2, useCORS: true, logging: false, width: 850, height: cloneHeight, scrollX: 0, scrollY: 0 })
        .then(function(canvas) {
            cleanupPrintClone(printElements);
            var link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(function(error) {
            console.error("PNG generation error:", error);
            cleanupPrintClone(printElements);
            showAlert("Error generating PNG. Please try again.");
        });
    }, 300);
}

// Export JSON
function exportJSON() {
    if (!currentMonster) { showAlert("Please load a monster first."); return; }
    
    var dataStr = JSON.stringify(currentMonster, null, 2);
    var blob = new Blob([dataStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var filename = currentMonster.name.replace(/[^a-z0-9]/gi, '_') + ".json";
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function getMod(score) {
    var mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? "+" + mod : "" + mod;
}

// ============================================================
// SECTION BUILDERS - Each returns an HTML string for a section
// ============================================================

function buildHeaderSection(monster) {
    var html = '';
    html += '<h1 class="monster-name">' + monster.name + '</h1>';
    html += '<p class="monster-type">' + monster.size + ' ' + monster.type + ', ' + monster.alignment + '</p>';
    html += '<hr class="divider">';
    html += '<div class="basic-stats">';
    html += '<p><span class="stat-label">Armor Class</span> ' + monster.ac + (monster.acType ? ' (' + monster.acType + ')' : '') + '</p>';
    html += '<p><span class="stat-label">Hit Points</span> ' + monster.hp + (monster.hpFormula ? ' (' + monster.hpFormula + ')' : '') + '</p>';
    html += '<p><span class="stat-label">Speed</span> ' + monster.speed + '</p>';
    html += '</div>';
    html += '<hr class="divider">';
    html += '<div class="abilities">';
    var abilityNames = ["str", "dex", "con", "int", "wis", "cha"];
    for (var i = 0; i < abilityNames.length; i++) {
        var ability = abilityNames[i];
        var score = monster.abilities[ability];
        html += '<div class="ability"><div class="ability-name">' + ability.toUpperCase() + '</div>';
        html += '<div class="ability-score">' + score + ' (' + getMod(score) + ')</div></div>';
    }
    html += '</div>';
    html += '<hr class="divider">';
    html += '<div class="secondary-stats">';
    if (monster.savingThrows) html += '<p><span class="stat-label">Saving Throws</span> ' + monster.savingThrows + '</p>';
    if (monster.skills) html += '<p><span class="stat-label">Skills</span> ' + monster.skills + '</p>';
    if (monster.damageVulnerabilities) html += '<p><span class="stat-label">Damage Vulnerabilities</span> ' + monster.damageVulnerabilities + '</p>';
    if (monster.damageResistances) html += '<p><span class="stat-label">Damage Resistances</span> ' + monster.damageResistances + '</p>';
    if (monster.damageImmunities) html += '<p><span class="stat-label">Damage Immunities</span> ' + monster.damageImmunities + '</p>';
    if (monster.conditionImmunities) html += '<p><span class="stat-label">Condition Immunities</span> ' + monster.conditionImmunities + '</p>';
    if (monster.senses) html += '<p><span class="stat-label">Senses</span> ' + monster.senses + '</p>';
    if (monster.languages) html += '<p><span class="stat-label">Languages</span> ' + monster.languages + '</p>';
    html += '<p><span class="stat-label">Challenge Rating</span> ' + monster.cr + (monster.xp ? ' (' + monster.xp + ' XP)' : '') + '</p>';
    html += '</div>';
    return html;
}

function buildFeaturesSection(monster) {
    if (!monster.features || monster.features.length === 0) return '';
    var html = '<hr class="divider">';
    for (var i = 0; i < monster.features.length; i++) {
        var feature = monster.features[i];
        html += '<div class="feature"><span class="feature-name">' + feature.name + '.</span> ';
        html += '<span class="feature-text">' + feature.text + '</span></div>';
    }
    return html;
}

// MIN_FIRST_ITEM_HEIGHT not needed - logic is in renderStatBlock now

function buildActionItemHtml(action) {
    var html = '<div class="action"><span class="action-name">' + action.name + '.</span> ';
    if (action.attackType) {
        html += '<span class="attack-type">' + action.attackType + ':</span> ' + action.toHit + ', ' + action.reach + ', ' + action.target + '. ';
        html += '<span class="hit-label"><em>Hit:</em></span> ' + action.damage;
    } else {
        html += '<span class="action-text">' + action.text + '</span>';
    }
    html += '</div>';
    return html;
}

function buildActionsSection(monster) {
    if (!monster.actions || monster.actions.length === 0) return '';
    var items = [];
    for (var i = 0; i < monster.actions.length; i++) {
        items.push(buildActionItemHtml(monster.actions[i]));
    }
    return buildSmartSection('<h2 class="section-header">Actions</h2>', items);
}

function buildBonusActionsSection(monster) {
    if (!monster.bonusActions || monster.bonusActions.length === 0) return '';
    var items = [];
    for (var i = 0; i < monster.bonusActions.length; i++) {
        var action = monster.bonusActions[i];
        items.push('<div class="action"><span class="action-name">' + action.name + '.</span> <span class="action-text">' + action.text + '</span></div>');
    }
    return buildSmartSection('<h2 class="section-header">Bonus Actions</h2>', items);
}

function buildReactionsSection(monster) {
    if (!monster.reactions || monster.reactions.length === 0) return '';
    var items = [];
    for (var i = 0; i < monster.reactions.length; i++) {
        var reaction = monster.reactions[i];
        items.push('<div class="action"><span class="action-name">' + reaction.name + '.</span> <span class="action-text">' + reaction.text + '</span></div>');
    }
    return buildSmartSection('<h2 class="section-header">Reactions</h2>', items);
}

function buildLegendaryActionsSection(monster) {
    if (!monster.legendaryActions || monster.legendaryActions.length === 0) return '';
    var items = [];
    if (monster.legendaryActionsDescription) {
        items.push('<p class="legendary-description">' + monster.legendaryActionsDescription + '</p>');
    }
    for (var i = 0; i < monster.legendaryActions.length; i++) {
        var action = monster.legendaryActions[i];
        items.push('<div class="legendary-action"><span class="legendary-action-name">' + action.name + '.</span> ' + action.text + '</div>');
    }
    return buildSmartSection('<h2 class="section-header">Legendary Actions</h2>', items);
}

function buildLairActionsSection(monster) {
    if (!monster.lairActions || monster.lairActions.length === 0) return '';
    var headerHtml = '<h2 class="section-header">Lair Actions</h2>';
    if (monster.lairActionsDescription) {
        headerHtml += '<p>' + monster.lairActionsDescription + '</p>';
    }
    var items = [];
    for (var i = 0; i < monster.lairActions.length; i++) {
        items.push('<li>' + monster.lairActions[i] + '</li>');
    }
    // Lair actions are a list - glue them all together
    return '<div class="section-start">' + headerHtml + '<ul>' + items.join('') + '</ul></div>';
}

function buildVillainActionsSection(monster) {
    if (!monster.villainActions || monster.villainActions.length === 0) return '';
    var items = [];
    for (var i = 0; i < monster.villainActions.length; i++) {
        var action = monster.villainActions[i];
        items.push('<div class="villain-action"><span class="villain-action-round">(Round ' + action.round + ')</span> <span class="villain-action-name">' + action.name + '.</span> ' + action.text + '</div>');
    }
    return buildSmartSection('<h2 class="section-header">Villain Actions</h2>', items);
}

// ============================================================
// COLUMN LAYOUT ENGINE
// ============================================================

// Measure the rendered height of an HTML string inside a single-column stat block
function measureSectionHeight(htmlString, containerWidth) {
    var measurer = document.createElement('div');
    measurer.style.cssText = 'position:absolute;visibility:hidden;width:' + containerWidth + 'px;font-family:Times New Roman,serif;font-size:14px;line-height:1.4;padding:0;margin:0;';
    measurer.className = 'stat-block-measure';
    measurer.innerHTML = htmlString;
    document.body.appendChild(measurer);
    var height = measurer.offsetHeight;
    document.body.removeChild(measurer);
    return height;
}

function renderStatBlock(monster) {
    var container = document.getElementById("stat-block-container");
    
    // Button row
    var buttonsHtml = '<div class="button-row">';
    buttonsHtml += '<label for="restore-upload" class="restore-btn">Overwrite</label>';
    buttonsHtml += '<input type="file" id="restore-upload" accept=".json" style="display:none" />';
    buttonsHtml += '<button class="export-btn" onclick="exportJSON()">Export</button>';
    buttonsHtml += '<button class="print-btn" onclick="printStatBlock()">PDF</button>';
    buttonsHtml += '<button class="print-btn" onclick="printPNG()">PNG</button>';
    buttonsHtml += '</div>';
    
    // Build all sections as arrays of individual items
    // Each item is: { html: string, type: 'header'|'item'|'fixed', sectionId: string }
    var items = [];
    
    // Header + features are always fixed in col1 as a single block
    var fixedHtml = buildHeaderSection(monster) + buildFeaturesSection(monster);
    items.push({ html: fixedHtml, type: 'fixed', sectionId: 'header' });
    
    // Break each section into header + individual items
    function addSection(sectionId, headerText, entries, buildItemFn) {
        if (!entries || entries.length === 0) return;
        items.push({ html: '<h2 class="section-header">' + headerText + '</h2>', type: 'header', sectionId: sectionId });
        for (var i = 0; i < entries.length; i++) {
            items.push({ html: buildItemFn(entries[i]), type: 'item', sectionId: sectionId });
        }
    }
    
    // Actions
    addSection('actions', 'Actions', monster.actions, function(a) {
        return buildActionItemHtml(a);
    });
    
    // Bonus Actions
    addSection('bonusActions', 'Bonus Actions', monster.bonusActions, function(a) {
        return '<div class="action"><span class="action-name">' + a.name + '.</span> <span class="action-text">' + a.text + '</span></div>';
    });
    
    // Reactions
    addSection('reactions', 'Reactions', monster.reactions, function(a) {
        return '<div class="action"><span class="action-name">' + a.name + '.</span> <span class="action-text">' + a.text + '</span></div>';
    });
    
    // Legendary Actions
    if (monster.legendaryActions && monster.legendaryActions.length > 0) {
        var legHeader = '<h2 class="section-header">Legendary Actions</h2>';
        if (monster.legendaryActionsDescription) {
            legHeader += '<p class="legendary-description">' + monster.legendaryActionsDescription + '</p>';
        }
        items.push({ html: legHeader, type: 'header', sectionId: 'legendary' });
        for (var i = 0; i < monster.legendaryActions.length; i++) {
            var la = monster.legendaryActions[i];
            items.push({ html: '<div class="legendary-action"><span class="legendary-action-name">' + la.name + '.</span> ' + la.text + '</div>', type: 'item', sectionId: 'legendary' });
        }
    }
    
    // Lair Actions (keep as one block since they're a list)
    if (monster.lairActions && monster.lairActions.length > 0) {
        var lairHtml = '<h2 class="section-header">Lair Actions</h2>';
        if (monster.lairActionsDescription) lairHtml += '<p>' + monster.lairActionsDescription + '</p>';
        lairHtml += '<ul>';
        for (var i = 0; i < monster.lairActions.length; i++) {
            lairHtml += '<li>' + monster.lairActions[i] + '</li>';
        }
        lairHtml += '</ul>';
        items.push({ html: lairHtml, type: 'fixed', sectionId: 'lair' });
    }
    
    // Villain Actions
    addSection('villainActions', 'Villain Actions', monster.villainActions, function(a) {
        return '<div class="villain-action"><span class="villain-action-round">(Round ' + a.round + ')</span> <span class="villain-action-name">' + a.name + '.</span> ' + a.text + '</div>';
    });
    
    // Measure all items
    var colWidth = 380;
    var heights = [];
    var totalHeight = 0;
    for (var i = 0; i < items.length; i++) {
        var h = measureSectionHeight(items[i].html, colWidth);
        heights.push(h);
        totalHeight += h;
    }
    
    // Single column if short enough
    var SINGLE_COL_THRESHOLD = 1000;
    if (totalHeight <= SINGLE_COL_THRESHOLD) {
        var html = buttonsHtml + '<div class="stat-block single-column">';
        for (var i = 0; i < items.length; i++) html += items[i].html;
        html += '</div>';
        container.innerHTML = html;
        return;
    }
    
    // Two-column layout: find the best split point
    // Rules:
    // 1. Col1 must never be shorter than col2
    // 2. The last item in col1 must be >= 4 lines (~80px tall)
    //    If not, we need at least 2 items after the last section header in col1
    // 3. A section header can never be the last item in col1 (orphaned header)
    var MIN_LAST_ITEM_HEIGHT = 80; // ~4 lines
    var idealMidpoint = totalHeight / 2;
    
    // Try each possible split point and score it
    var bestSplit = 1; // At minimum, fixed header goes in col1
    var bestScore = Infinity;
    
    for (var split = 1; split < items.length; split++) {
        // Col1 = items[0..split-1], Col2 = items[split..end]
        var col1Height = 0;
        var col2Height = 0;
        for (var j = 0; j < split; j++) col1Height += heights[j];
        for (var j = split; j < items.length; j++) col2Height += heights[j];
        
        // Rule: col2 must never be significantly longer than col1
        // Col1 can be longer than col2 — that's fine
        if (col2Height > col1Height * 1.05) continue;
        
        // Rule: last item in col1 cannot be a section header (orphan)
        if (items[split - 1].type === 'header') continue;
        
        // Rule: check if last item in col1 is substantial enough
        var lastCol1Item = items[split - 1];
        var lastCol1Height = heights[split - 1];
        
        if (lastCol1Height < MIN_LAST_ITEM_HEIGHT && lastCol1Item.type === 'item') {
            // Last item is too short. Check: are there at least 2 items
            // from this section in col1 (after its header)?
            var sectionId = lastCol1Item.sectionId;
            var sectionItemsInCol1 = 0;
            for (var j = 0; j < split; j++) {
                if (items[j].sectionId === sectionId && items[j].type === 'item') {
                    sectionItemsInCol1++;
                }
            }
            if (sectionItemsInCol1 < 2) continue;
        }
        
        // Score: prefer balanced columns, but slightly favor col1 being taller
        // We weight col2-longer scenarios as worse than col1-longer
        var imbalance;
        if (col2Height > col1Height) {
            imbalance = (col2Height - col1Height) * 2; // penalize col2 being taller
        } else {
            imbalance = col1Height - col2Height; // col1 taller is less bad
        }
        if (imbalance < bestScore) {
            bestScore = imbalance;
            bestSplit = split;
        }
    }
    
    // Build two-column HTML
    var html = buttonsHtml + '<div class="stat-block two-column">';
    html += '<div class="stat-col stat-col-1">';
    for (var i = 0; i < bestSplit; i++) html += items[i].html;
    html += '</div>';
    html += '<div class="stat-col stat-col-2">';
    for (var i = bestSplit; i < items.length; i++) html += items[i].html;
    html += '</div>';
    html += '</div>';
    
    container.innerHTML = html;
    
    // Attach restore upload listener
    var restoreInput = document.getElementById("restore-upload");
    if (restoreInput) {
        restoreInput.addEventListener("change", handleRestoreUpload);
    }
}

function handleRestoreUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    
    if (!currentUser) {
        showAlert("Please sign in to overwrite monsters.");
        e.target.value = '';
        return;
    }
    
    if (!currentMonsterDocId) {
        showAlert("No saved monster is currently open. Load a monster first, then overwrite.");
        e.target.value = '';
        return;
    }
    
    var reader = new FileReader();
    reader.onload = function(event) {
        try {
            var monsterData = JSON.parse(event.target.result);
            
            showConfirm('Replace "' + (currentMonster.name || "current monster") + '" with "' + (monsterData.name || "uploaded data") + '"?', function() {
                // Preserve the groupId from the existing monster
                monsterData.groupId = currentMonster.groupId || null;
                
                db.collection("users").doc(currentUser.uid).collection("monsters").doc(currentMonsterDocId)
                    .set(monsterData)
                    .then(function() {
                        currentMonster = monsterData;
                        renderStatBlock(monsterData);
                        loadGroupsAndMonsters();
                        showAlert(monsterData.name + " overwritten successfully!");
                    })
                    .catch(function(error) {
                        console.error("Error overwriting monster:", error);
                        showAlert("Error overwriting: " + error.message);
                    });
            });
        } catch (err) {
            showAlert("Invalid JSON file: " + err.message);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}
    };
    reader.readAsText(file);
}

function exportTemplate() {
    var template = {
        "name": "Monster Name",
        "size": "Medium",
        "type": "Humanoid (Race)",
        "alignment": "Any Alignment",
        "ac": 15,
        "acType": "leather armor",
        "hp": 45,
        "hpFormula": "7d8 + 14",
        "speed": "30 ft.",
        "abilities": {
            "str": 10,
            "dex": 16,
            "con": 14,
            "int": 12,
            "wis": 12,
            "cha": 10
        },
        "savingThrows": "Dex +5, Con +4",
        "skills": "Stealth +5, Perception +3",
        "damageVulnerabilities": "",
        "damageResistances": "",
        "damageImmunities": "",
        "conditionImmunities": "",
        "senses": "darkvision 60 ft., passive Perception 13",
        "languages": "Common",
        "cr": "3",
        "xp": "700",
        "features": [
            {
                "name": "Feature Name",
                "text": "Description of the feature."
            }
        ],
        "actions": [
            {
                "name": "Multiattack",
                "text": "The creature makes two attacks."
            },
            {
                "name": "Longsword",
                "attackType": "Melee Weapon Attack",
                "toHit": "+5 to hit",
                "reach": "reach 5 ft.",
                "target": "one target",
                "damage": "7 (1d8 + 3) slashing damage."
            }
        ],
        "bonusActions": [
            {
                "name": "Bonus Action Name",
                "text": "Description of the bonus action."
            }
        ],
        "reactions": [
            {
                "name": "Reaction Name",
                "text": "Description of the reaction."
            }
        ],
        "legendaryActions": [],
        "legendaryActionsDescription": "",
        "lairActions": [],
        "lairActionsDescription": "",
        "villainActions": []
    };

    var instructions = [
        "MONSTER STATBLOCK JSON CONVERSION INSTRUCTIONS",
        "==============================================",
        "",
        "Use these instructions along with the included statblock_template.json to convert",
        "a D&D 5e monster or NPC character sheet into the proper JSON format for upload to",
        "the Monster Statblock Generator.",
        "",
        "RULES:",
        "",
        "1. Follow the statblock_template.json structure exactly. Do not add or rename any fields.",
        "",
        "2. All ability scores are raw numbers (e.g. 16, not \"+3\"). Modifiers are",
        "   calculated automatically by the app.",
        "",
        "3. For ACTIONS, there are two formats:",
        "",
        "   ATTACK actions use these fields:",
        "     \"name\": \"Longsword\"",
        "     \"attackType\": \"Melee Weapon Attack\"    (or \"Ranged Weapon Attack\")",
        "     \"toHit\": \"+5 to hit\"",
        "     \"reach\": \"reach 5 ft.\"                 (or \"range 80/320 ft.\")",
        "     \"target\": \"one target\"",
        "     \"damage\": \"7 (1d8 + 3) slashing damage.\"",
        "",
        "   NON-ATTACK actions use these fields:",
        "     \"name\": \"Multiattack\"",
        "     \"text\": \"The creature makes two attacks.\"",
        "",
        "   Do NOT mix both formats on the same action.",
        "",
        "4. bonusActions, reactions, legendaryActions all use { \"name\": ..., \"text\": ... }",
        "",
        "5. legendaryActions should include a \"legendaryActionsDescription\" string like:",
        "   \"The dragon can take 3 legendary actions, choosing from the options below.\"",
        "",
        "6. villainActions use this format:",
        "   { \"round\": 1, \"name\": \"Action Name\", \"text\": \"Description.\" }",
        "",
        "7. lairActions is an array of plain strings (no name/text objects).",
        "",
        "8. Optional string fields (damageVulnerabilities, damageResistances, etc.) can",
        "   be empty strings \"\" or omitted entirely if not applicable.",
        "",
        "9. Remove any example/placeholder entries from the template that don't apply.",
        "   For example, if the monster has no bonus actions, set \"bonusActions\": []",
        "",
        "10. HTML is supported in text fields. Use <b><i>Sub-heading.</i></b> for",
        "    sub-sections within a single ability, and <br><br> for paragraph breaks.",
        "",
        "11. Output ONLY valid JSON. No comments, no markdown, no explanation.",
        ""
    ].join("\n");

    var readme = [
        "MONSTER STATBLOCK TEMPLATE KIT",
        "==============================",
        "",
        "This zip contains everything you need to create a properly formatted",
        "monster statblock JSON file for upload to the Monster Statblock Generator.",
        "",
        "INCLUDED FILES:",
        "",
        "  statblock_template.json",
        "    A blank monster template with all supported fields and example values.",
        "    Fill this in with your monster's stats, or use it as a reference for",
        "    the expected JSON structure.",
        "",
        "  statblock_instructions.txt",
        "    Detailed rules for how to format the JSON. Give this file to an AI",
        "    tool (like ChatGPT or Claude) along with your character sheet or",
        "    monster notes, and it will convert them into the correct format.",
        "",
        "HOW TO USE:",
        "",
        "  Option 1 - Manual:",
        "    Copy statblock_template.json, fill in your monster's data, and",
        "    upload it using the \"Upload JSON\" button in the app.",
        "",
        "  Option 2 - AI-Assisted:",
        "    Give an AI tool both the statblock_instructions.txt and your",
        "    monster's character sheet or notes. Ask it to output a JSON file",
        "    in the correct format. Upload the result to the app.",
        "",
        "  Once uploaded, click \"Save\" to store it in your account, or",
        "  \"Overwrite\" to replace an existing saved monster's data.",
        ""
    ].join("\n");

    var zip = new JSZip();
    zip.file("statblock_template.json", JSON.stringify(template, null, 2));
    zip.file("statblock_instructions.txt", instructions);
    zip.file("README.txt", readme);

    zip.generateAsync({ type: "blob" }).then(function(content) {
        var url = URL.createObjectURL(content);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'statblock_template_kit.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

function handleFileUpload(e) {
    var file = e.target.files[0];
    if (file) {
        var reader = new FileReader();
        reader.onload = function(event) {
            try {
                var monster = JSON.parse(event.target.result);
                currentMonster = monster;
                renderStatBlock(monster);
                
                // Auto-save to Firestore if signed in
                if (currentUser) {
                    saveMonster(monster);
                }
            } catch (err) {
                showAlert("Error parsing JSON file: " + err.message);
            }
        };
        reader.readAsText(file);
    }
    e.target.value = '';
}
