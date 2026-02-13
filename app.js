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
var sidebarOpen = false;
var activeTab = 'statblock';

function toggleSidebar() {
    var content = document.getElementById('sidebar-content');
    var toggle = document.getElementById('sidebar-toggle');
    sidebarOpen = !sidebarOpen;
    if (sidebarOpen) {
        content.classList.add('open');
        toggle.classList.add('open');
    } else {
        content.classList.remove('open');
        toggle.classList.remove('open');
    }
}

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

function showConfirm(message, onConfirm, onCancel) {
    showModal(message, [
        { text: 'Cancel', className: 'modal-btn-cancel', onClick: onCancel },
        { text: 'OK', className: 'modal-btn-confirm', onClick: onConfirm }
    ]);
}

var isEditing = false;

function toggleEdit() {
    var statBlock = document.querySelector('.stat-block');
    if (!statBlock || !currentMonster) return;
    
    if (!isEditing) {
        // Enter edit mode
        isEditing = true;
        statBlock.classList.add('editing');
        
        // Make all data-field spans editable
        var fields = statBlock.querySelectorAll('[data-field]');
        for (var i = 0; i < fields.length; i++) {
            fields[i].setAttribute('contenteditable', 'true');
        }
        
        // Make feature/action name spans and text spans editable
        var names = statBlock.querySelectorAll('.feature-name, .action-name, .legendary-action-name, .villain-action-name');
        for (var i = 0; i < names.length; i++) {
            names[i].setAttribute('contenteditable', 'true');
        }
        var texts = statBlock.querySelectorAll('.feature-text, .action-text, .legendary-description');
        for (var i = 0; i < texts.length; i++) {
            texts[i].setAttribute('contenteditable', 'true');
        }
        
        // Make attack detail spans editable
        var attacks = statBlock.querySelectorAll('.attack-type');
        for (var i = 0; i < attacks.length; i++) {
            attacks[i].parentNode.setAttribute('contenteditable', 'true');
        }
        
        // Make lair action list items editable
        var lairItems = statBlock.querySelectorAll('[data-section="lairActions"]');
        for (var i = 0; i < lairItems.length; i++) {
            lairItems[i].setAttribute('contenteditable', 'true');
        }
        
        // Update button
        var btn = statBlock.parentNode.querySelector('.edit-btn');
        if (btn) { btn.textContent = '✓'; btn.title = 'Save edits'; btn.classList.add('edit-active'); }
    } else {
        // Exit edit mode - parse back and save
        parseStatBlockBack(statBlock);
        
        isEditing = false;
        statBlock.classList.remove('editing');
        
        // Remove contenteditable from everything
        var editables = statBlock.querySelectorAll('[contenteditable]');
        for (var i = 0; i < editables.length; i++) {
            editables[i].removeAttribute('contenteditable');
        }
        
        // Re-render with updated data
        renderStatBlock(currentMonster);
        
        // Auto-save if we have a doc ID
        if (currentUser && currentMonsterDocId) {
            var saveData = Object.assign({}, currentMonster);
            db.collection("users").doc(currentUser.uid).collection("monsters").doc(currentMonsterDocId)
                .set(saveData)
                .then(function() {
                    showAlert(currentMonster.name + " updated!");
                    loadGroupsAndMonsters();
                })
                .catch(function(error) {
                    showAlert("Error saving edits: " + error.message);
                });
        }
    }
}

function parseStatBlockBack(statBlock) {
    // Name
    var nameEl = statBlock.querySelector('[data-field="name"]');
    if (nameEl) currentMonster.name = nameEl.textContent.trim();
    
    // Type line: "Size Type, Alignment"
    var typeEl = statBlock.querySelector('[data-field="type-line"]');
    if (typeEl) {
        var typeLine = typeEl.textContent.trim();
        var commaIdx = typeLine.lastIndexOf(',');
        if (commaIdx > -1) {
            var sizeType = typeLine.substring(0, commaIdx).trim();
            currentMonster.alignment = typeLine.substring(commaIdx + 1).trim();
            var spaceIdx = sizeType.indexOf(' ');
            if (spaceIdx > -1) {
                currentMonster.size = sizeType.substring(0, spaceIdx).trim();
                currentMonster.type = sizeType.substring(spaceIdx + 1).trim();
            }
        }
    }
    
    // AC line: "18 (plate armor)" or "18"
    var acEl = statBlock.querySelector('[data-field="ac-line"]');
    if (acEl) {
        var acText = acEl.textContent.trim();
        var acMatch = acText.match(/^(\d+)\s*(?:\((.+)\))?/);
        if (acMatch) {
            currentMonster.ac = parseInt(acMatch[1]);
            currentMonster.acType = acMatch[2] ? acMatch[2].trim() : '';
        }
    }
    
    // HP line: "36 (8d6 + 8)" or "36"
    var hpEl = statBlock.querySelector('[data-field="hp-line"]');
    if (hpEl) {
        var hpText = hpEl.textContent.trim();
        var hpMatch = hpText.match(/^(\d+)\s*(?:\((.+)\))?/);
        if (hpMatch) {
            currentMonster.hp = parseInt(hpMatch[1]);
            currentMonster.hpFormula = hpMatch[2] ? hpMatch[2].trim() : '';
        }
    }
    
    // Speed
    var speedEl = statBlock.querySelector('[data-field="speed"]');
    if (speedEl) currentMonster.speed = speedEl.textContent.trim();
    
    // Ability scores: parse "18 (+4)" -> 18
    var abilityNames = ["str", "dex", "con", "int", "wis", "cha"];
    for (var i = 0; i < abilityNames.length; i++) {
        var ab = abilityNames[i];
        var abEl = statBlock.querySelector('[data-field="ability-' + ab + '"]');
        if (abEl) {
            var abMatch = abEl.textContent.trim().match(/^(\d+)/);
            if (abMatch) currentMonster.abilities[ab] = parseInt(abMatch[1]);
        }
    }
    
    // Simple string fields
    var stringFields = ['savingThrows', 'skills', 'damageVulnerabilities', 'damageResistances', 'damageImmunities', 'conditionImmunities', 'senses', 'languages'];
    for (var i = 0; i < stringFields.length; i++) {
        var el = statBlock.querySelector('[data-field="' + stringFields[i] + '"]');
        if (el) currentMonster[stringFields[i]] = el.textContent.trim();
    }
    
    // CR line: "4 (1100 XP)"
    var crEl = statBlock.querySelector('[data-field="cr-line"]');
    if (crEl) {
        var crText = crEl.textContent.trim();
        var crMatch = crText.match(/^([^\s(]+)\s*(?:\((\d+)\s*XP\))?/);
        if (crMatch) {
            currentMonster.cr = crMatch[1].trim();
            if (crMatch[2]) currentMonster.xp = crMatch[2].trim();
        }
    }
    
    // Features
    parseItemsBack(statBlock, 'features', '.feature-name', '.feature-text');
    
    // Actions (both attack and non-attack)
    var actionEls = statBlock.querySelectorAll('[data-section="actions"]');
    for (var i = 0; i < actionEls.length; i++) {
        var idx = parseInt(actionEls[i].getAttribute('data-index'));
        if (idx < currentMonster.actions.length) {
            var nameSpan = actionEls[i].querySelector('.action-name');
            if (nameSpan) currentMonster.actions[idx].name = nameSpan.textContent.replace(/\.\s*$/, '').trim();
            
            if (currentMonster.actions[idx].attackType) {
                // For attack actions, parse the full text content
                var fullText = actionEls[i].textContent;
                var attackTypeSpan = actionEls[i].querySelector('.attack-type');
                if (attackTypeSpan) currentMonster.actions[idx].attackType = attackTypeSpan.textContent.replace(/:\s*$/, '').trim();
            } else {
                var textSpan = actionEls[i].querySelector('.action-text');
                if (textSpan) currentMonster.actions[idx].text = textSpan.innerHTML.trim();
            }
        }
    }
    
    // Bonus Actions, Reactions
    parseItemsBack(statBlock, 'bonusActions', '.action-name', '.action-text');
    parseItemsBack(statBlock, 'reactions', '.action-name', '.action-text');
    
    // Legendary Actions
    var legDescEl = statBlock.querySelector('[data-field="legendaryActionsDescription"]');
    if (legDescEl) currentMonster.legendaryActionsDescription = legDescEl.textContent.trim();
    parseItemsBack(statBlock, 'legendaryActions', '.legendary-action-name', null);
    
    // Lair Actions
    var lairEls = statBlock.querySelectorAll('[data-section="lairActions"]');
    for (var i = 0; i < lairEls.length; i++) {
        var idx = parseInt(lairEls[i].getAttribute('data-index'));
        if (currentMonster.lairActions && idx < currentMonster.lairActions.length) {
            currentMonster.lairActions[idx] = lairEls[i].innerHTML.trim();
        }
    }
    
    // Lair Actions Description
    var lairDescEl = statBlock.querySelector('[data-field="lairActionsDescription"]');
    if (lairDescEl) currentMonster.lairActionsDescription = lairDescEl.textContent.trim();
    
    // Villain Actions
    var villainEls = statBlock.querySelectorAll('[data-section="villainActions"]');
    for (var i = 0; i < villainEls.length; i++) {
        var idx = parseInt(villainEls[i].getAttribute('data-index'));
        if (currentMonster.villainActions && idx < currentMonster.villainActions.length) {
            var vNameSpan = villainEls[i].querySelector('.villain-action-name');
            if (vNameSpan) currentMonster.villainActions[idx].name = vNameSpan.textContent.replace(/\.\s*$/, '').trim();
        }
    }
}

function parseItemsBack(statBlock, sectionName, nameSelector, textSelector) {
    var els = statBlock.querySelectorAll('[data-section="' + sectionName + '"]');
    for (var i = 0; i < els.length; i++) {
        var idx = parseInt(els[i].getAttribute('data-index'));
        if (currentMonster[sectionName] && idx < currentMonster[sectionName].length) {
            var nameSpan = els[i].querySelector(nameSelector);
            if (nameSpan) currentMonster[sectionName][idx].name = nameSpan.textContent.replace(/\.\s*$/, '').trim();
            if (textSelector) {
                var textSpan = els[i].querySelector(textSelector);
                if (textSpan) currentMonster[sectionName][idx].text = textSpan.innerHTML.trim();
            }
        }
    }
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
    
    // Preserve the actual flex-based two-column layout
    var isTwoCol = element.classList.contains('two-column');
    if (isTwoCol) {
        clone.style.cssText = 'display:flex!important;width:840px!important;max-width:none!important;min-width:840px!important;gap:40px!important;font-size:14px!important;padding:20px!important;background:#f5f5f5!important;border-top:4px solid #184e4f!important;border-bottom:4px solid #184e4f!important;box-shadow:none!important;box-sizing:border-box!important;overflow:visible!important;';
        // Style the columns
        var cols = clone.querySelectorAll('.stat-col');
        for (var i = 0; i < cols.length; i++) {
            if (cols[i].classList.contains('stat-col-1')) {
                cols[i].style.cssText = 'flex:1!important;min-width:0!important;padding-right:20px!important;border-right:1px solid #184e4f!important;';
            } else {
                cols[i].style.cssText = 'flex:1!important;min-width:0!important;';
            }
        }
    } else {
        clone.style.cssText = 'display:block!important;width:450px!important;max-width:none!important;font-size:14px!important;padding:20px!important;background:#f5f5f5!important;border-top:4px solid #184e4f!important;border-bottom:4px solid #184e4f!important;box-shadow:none!important;box-sizing:border-box!important;overflow:visible!important;';
    }
    
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
            html2canvas: { scale: 2, useCORS: true, logging: false, width: 840, height: cloneHeight, scrollX: 0, scrollY: 0 },
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
        
        html2canvas(printElements.clone, { scale: 2, useCORS: true, logging: false, width: 840, height: cloneHeight, scrollX: 0, scrollY: 0 })
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
    html += '<h1 class="monster-name" data-field="name">' + monster.name + '</h1>';
    html += '<p class="monster-type" data-field="type-line">' + monster.size + ' ' + monster.type + ', ' + monster.alignment + '</p>';
    html += '<hr class="divider">';
    html += '<div class="basic-stats">';
    html += '<p><span class="stat-label">Armor Class</span> <span data-field="ac-line">' + monster.ac + (monster.acType ? ' (' + monster.acType + ')' : '') + '</span></p>';
    html += '<p><span class="stat-label">Hit Points</span> <span data-field="hp-line">' + monster.hp + (monster.hpFormula ? ' (' + monster.hpFormula + ')' : '') + '</span></p>';
    html += '<p><span class="stat-label">Speed</span> <span data-field="speed">' + monster.speed + '</span></p>';
    html += '</div>';
    html += '<hr class="divider">';
    html += '<div class="abilities">';
    var abilityNames = ["str", "dex", "con", "int", "wis", "cha"];
    for (var i = 0; i < abilityNames.length; i++) {
        var ability = abilityNames[i];
        var score = monster.abilities[ability];
        html += '<div class="ability"><div class="ability-name">' + ability.toUpperCase() + '</div>';
        html += '<div class="ability-score" data-field="ability-' + ability + '">' + score + ' (' + getMod(score) + ')</div></div>';
    }
    html += '</div>';
    html += '<hr class="divider">';
    html += '<div class="secondary-stats">';
    if (monster.savingThrows) html += '<p><span class="stat-label">Saving Throws</span> <span data-field="savingThrows">' + monster.savingThrows + '</span></p>';
    if (monster.skills) html += '<p><span class="stat-label">Skills</span> <span data-field="skills">' + monster.skills + '</span></p>';
    if (monster.damageVulnerabilities) html += '<p><span class="stat-label">Damage Vulnerabilities</span> <span data-field="damageVulnerabilities">' + monster.damageVulnerabilities + '</span></p>';
    if (monster.damageResistances) html += '<p><span class="stat-label">Damage Resistances</span> <span data-field="damageResistances">' + monster.damageResistances + '</span></p>';
    if (monster.damageImmunities) html += '<p><span class="stat-label">Damage Immunities</span> <span data-field="damageImmunities">' + monster.damageImmunities + '</span></p>';
    if (monster.conditionImmunities) html += '<p><span class="stat-label">Condition Immunities</span> <span data-field="conditionImmunities">' + monster.conditionImmunities + '</span></p>';
    if (monster.senses) html += '<p><span class="stat-label">Senses</span> <span data-field="senses">' + monster.senses + '</span></p>';
    if (monster.languages) html += '<p><span class="stat-label">Languages</span> <span data-field="languages">' + monster.languages + '</span></p>';
    html += '<p><span class="stat-label">Challenge Rating</span> <span data-field="cr-line">' + monster.cr + (monster.xp ? ' (' + monster.xp + ' XP)' : '') + '</span></p>';
    html += '</div>';
    return html;
}

function buildFeaturesSection(monster) {
    if (!monster.features || monster.features.length === 0) return '';
    var html = '<hr class="divider">';
    for (var i = 0; i < monster.features.length; i++) {
        var feature = monster.features[i];
        html += '<div class="feature" data-section="features" data-index="' + i + '"><span class="feature-name">' + feature.name + '.</span> ';
        html += '<span class="feature-text">' + feature.text + '</span></div>';
    }
    return html;
}

// MIN_FIRST_ITEM_HEIGHT not needed - logic is in renderStatBlock now

function buildActionItemHtml(action, index) {
    var html = '<div class="action" data-section="actions" data-index="' + index + '"><span class="action-name">' + action.name + '.</span> ';
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
        items.push(buildActionItemHtml(monster.actions[i], i));
    }
    return buildSmartSection('<h2 class="section-header">Actions</h2>', items);
}

function buildBonusActionsSection(monster) {
    if (!monster.bonusActions || monster.bonusActions.length === 0) return '';
    var items = [];
    for (var i = 0; i < monster.bonusActions.length; i++) {
        var action = monster.bonusActions[i];
        items.push('<div class="action" data-section="bonusActions" data-index="' + i + '"><span class="action-name">' + action.name + '.</span> <span class="action-text">' + action.text + '</span></div>');
    }
    return buildSmartSection('<h2 class="section-header">Bonus Actions</h2>', items);
}

function buildReactionsSection(monster) {
    if (!monster.reactions || monster.reactions.length === 0) return '';
    var items = [];
    for (var i = 0; i < monster.reactions.length; i++) {
        var reaction = monster.reactions[i];
        items.push('<div class="action" data-section="reactions" data-index="' + i + '"><span class="action-name">' + reaction.name + '.</span> <span class="action-text">' + reaction.text + '</span></div>');
    }
    return buildSmartSection('<h2 class="section-header">Reactions</h2>', items);
}

function buildLegendaryActionsSection(monster) {
    if (!monster.legendaryActions || monster.legendaryActions.length === 0) return '';
    var items = [];
    if (monster.legendaryActionsDescription) {
        items.push('<p class="legendary-description" data-field="legendaryActionsDescription">' + monster.legendaryActionsDescription + '</p>');
    }
    for (var i = 0; i < monster.legendaryActions.length; i++) {
        var action = monster.legendaryActions[i];
        items.push('<div class="legendary-action" data-section="legendaryActions" data-index="' + i + '"><span class="legendary-action-name">' + action.name + '.</span> ' + action.text + '</div>');
    }
    return buildSmartSection('<h2 class="section-header">Legendary Actions</h2>', items);
}

function buildLairActionsSection(monster) {
    if (!monster.lairActions || monster.lairActions.length === 0) return '';
    var headerHtml = '<h2 class="section-header">Lair Actions</h2>';
    if (monster.lairActionsDescription) {
        headerHtml += '<p data-field="lairActionsDescription">' + monster.lairActionsDescription + '</p>';
    }
    var items = [];
    for (var i = 0; i < monster.lairActions.length; i++) {
        items.push('<li data-section="lairActions" data-index="' + i + '">' + monster.lairActions[i] + '</li>');
    }
    return '<div class="section-start">' + headerHtml + '<ul>' + items.join('') + '</ul></div>';
}

function buildVillainActionsSection(monster) {
    if (!monster.villainActions || monster.villainActions.length === 0) return '';
    var items = [];
    for (var i = 0; i < monster.villainActions.length; i++) {
        var action = monster.villainActions[i];
        items.push('<div class="villain-action" data-section="villainActions" data-index="' + i + '"><span class="villain-action-round">(Round ' + action.round + ')</span> <span class="villain-action-name">' + action.name + '.</span> ' + action.text + '</div>');
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
    
    // Build all sections as arrays of individual items
    // Each item is: { html: string, type: 'header'|'item'|'fixed', sectionId: string }
    var items = [];
    
    // Header + features are always fixed in col1 as a single block
    var fixedHtml = buildHeaderSection(monster) + buildFeaturesSection(monster);
    items.push({ html: fixedHtml, type: 'fixed', sectionId: 'header' });
    
    // Break each section into header + individual items
    // Items with <br><br> in text get split into paragraph-level sub-items
    function addSection(sectionId, headerText, entries, buildItemFn) {
        if (!entries || entries.length === 0) return;
        items.push({ html: '<h2 class="section-header">' + headerText + '</h2>', type: 'header', sectionId: sectionId });
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            // Check if text contains paragraph breaks
            if (entry.text && entry.text.indexOf('<br><br>') !== -1) {
                var paragraphs = entry.text.split('<br><br>');
                // First paragraph includes the name
                var firstHtml = '<div class="action" data-section="' + sectionId + '" data-index="' + i + '"><span class="action-name">' + entry.name + '.</span> <span class="action-text">' + paragraphs[0] + '</span></div>';
                items.push({ html: firstHtml, type: 'item', sectionId: sectionId });
                // Subsequent paragraphs are continuation items
                for (var p = 1; p < paragraphs.length; p++) {
                    var contHtml = '<div class="action action-continuation" data-section="' + sectionId + '" data-index="' + i + '" data-para="' + p + '"><span class="action-text">' + paragraphs[p] + '</span></div>';
                    items.push({ html: contHtml, type: 'item', sectionId: sectionId });
                }
            } else {
                items.push({ html: buildItemFn(entry, i), type: 'item', sectionId: sectionId });
            }
        }
    }
    
    // Actions
    addSection('actions', 'Actions', monster.actions, function(a, idx) {
        return buildActionItemHtml(a, idx);
    });
    
    // Bonus Actions
    addSection('bonusActions', 'Bonus Actions', monster.bonusActions, function(a, idx) {
        return '<div class="action" data-section="bonusActions" data-index="' + idx + '"><span class="action-name">' + a.name + '.</span> <span class="action-text">' + a.text + '</span></div>';
    });
    
    // Reactions
    addSection('reactions', 'Reactions', monster.reactions, function(a, idx) {
        return '<div class="action" data-section="reactions" data-index="' + idx + '"><span class="action-name">' + a.name + '.</span> <span class="action-text">' + a.text + '</span></div>';
    });
    
    // Legendary Actions
    if (monster.legendaryActions && monster.legendaryActions.length > 0) {
        var legHeader = '<h2 class="section-header">Legendary Actions</h2>';
        if (monster.legendaryActionsDescription) {
            legHeader += '<p class="legendary-description" data-field="legendaryActionsDescription">' + monster.legendaryActionsDescription + '</p>';
        }
        items.push({ html: legHeader, type: 'header', sectionId: 'legendary' });
        for (var i = 0; i < monster.legendaryActions.length; i++) {
            var la = monster.legendaryActions[i];
            items.push({ html: '<div class="legendary-action" data-section="legendaryActions" data-index="' + i + '"><span class="legendary-action-name">' + la.name + '.</span> ' + la.text + '</div>', type: 'item', sectionId: 'legendary' });
        }
    }
    
    // Lair Actions (keep as one block since they're a list)
    if (monster.lairActions && monster.lairActions.length > 0) {
        var lairHtml = '<h2 class="section-header">Lair Actions</h2>';
        if (monster.lairActionsDescription) lairHtml += '<p data-field="lairActionsDescription">' + monster.lairActionsDescription + '</p>';
        lairHtml += '<ul>';
        for (var i = 0; i < monster.lairActions.length; i++) {
            lairHtml += '<li data-section="lairActions" data-index="' + i + '">' + monster.lairActions[i] + '</li>';
        }
        lairHtml += '</ul>';
        items.push({ html: lairHtml, type: 'fixed', sectionId: 'lair' });
    }
    
    // Villain Actions
    addSection('villainActions', 'Villain Actions', monster.villainActions, function(a, idx) {
        return '<div class="villain-action" data-section="villainActions" data-index="' + idx + '"><span class="villain-action-round">(Round ' + a.round + ')</span> <span class="villain-action-name">' + a.name + '.</span> ' + a.text + '</div>';
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
        var html = '<div class="stat-block single-column">';
        for (var i = 0; i < items.length; i++) html += items[i].html;
        html += '</div>';
        container.innerHTML = html;
        renderTabs();
        return;
    }
    
    // Two-column layout: find the best split point
    // Rules:
    // 1. Col2 can NEVER be significantly longer than col1 (max 5% taller)
    //    If no split satisfies this, keep extending col1 (col1 longer is OK)
    // 2. Col1 must end with a full paragraph of at least 4 lines (~80px)
    //    If the last item is shorter, need at least 2 items from that section in col1
    // 3. A section header can never be the last item in col1 (orphaned header)
    // 4. Col1 being longer than col2 is acceptable and preferred over col2 being longer
    var MIN_LAST_ITEM_HEIGHT = 80; // ~4 lines
    var MIN_COL1_HEIGHT = 400; // Minimum col1 height before allowing split
    
    // Try each possible split point and score it
    var bestSplit = -1;
    var bestScore = Infinity;
    
    for (var split = 1; split < items.length; split++) {
        // Col1 = items[0..split-1], Col2 = items[split..end]
        var col1Height = 0;
        var col2Height = 0;
        for (var j = 0; j < split; j++) col1Height += heights[j];
        for (var j = split; j < items.length; j++) col2Height += heights[j];
        
        // Rule: col1 must meet minimum height before we allow a split
        if (col1Height < MIN_COL1_HEIGHT) continue;
        
        // Rule: last item in col1 cannot be a section header (orphan)
        if (items[split - 1].type === 'header') continue;
        
        // Rule: col1 must end with a substantial paragraph (>= 4 lines)
        // If the last item is too short, need at least 2 items from that section
        var lastCol1Item = items[split - 1];
        var lastCol1Height = heights[split - 1];
        
        if (lastCol1Height < MIN_LAST_ITEM_HEIGHT && lastCol1Item.type === 'item') {
            var sectionId = lastCol1Item.sectionId;
            var sectionItemsInCol1 = 0;
            for (var j = 0; j < split; j++) {
                if (items[j].sectionId === sectionId && items[j].type === 'item') {
                    sectionItemsInCol1++;
                }
            }
            if (sectionItemsInCol1 < 2) continue;
        }
        
        // Rule: col2 must NEVER be significantly longer than col1 (max 5%)
        if (col2Height > col1Height * 1.05) continue;
        
        // Score: prefer balanced columns, but col1 being taller is OK
        // Col2 being taller is penalized more heavily
        var imbalance;
        if (col2Height > col1Height) {
            imbalance = (col2Height - col1Height) * 2;
        } else {
            imbalance = col1Height - col2Height;
        }
        if (imbalance < bestScore) {
            bestScore = imbalance;
            bestSplit = split;
        }
    }
    
    // If no valid split found, fall back to single column
    if (bestSplit === -1) {
        var html = '<div class="stat-block single-column">';
        for (var i = 0; i < items.length; i++) html += items[i].html;
        html += '</div>';
        container.innerHTML = html;
        renderTabs();
        return;
    }
    
    // Build two-column HTML
    var html = '<div class="stat-block two-column">';
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
    
    // After statblock renders, build tabs if summary exists
    renderTabs();
}

// ============ TAB SYSTEM ============
function renderTabs() {
    var container = document.getElementById("stat-block-container");
    var statblockContent = container.innerHTML;
    
    // Button row — always above tabs
    var buttonsHtml = '<div class="button-row">';
    buttonsHtml += '<label for="restore-upload" class="restore-btn">Overwrite</label>';
    buttonsHtml += '<input type="file" id="restore-upload" accept=".json" style="display:none" />';
    buttonsHtml += '<button class="export-btn" onclick="exportJSON()">Export</button>';
    buttonsHtml += '<button class="print-btn" onclick="printStatBlock()">PDF</button>';
    buttonsHtml += '<button class="print-btn" onclick="printPNG()">PNG</button>';
    buttonsHtml += '<button class="edit-btn" onclick="toggleEdit()" title="Edit statblock">&#9998;</button>';
    buttonsHtml += '</div>';
    
    // Build tab bar
    var tabsHtml = '<div class="tab-bar">';
    tabsHtml += '<button class="tab-btn' + (activeTab === 'statblock' ? ' active' : '') + '" onclick="switchTab(\'statblock\')">Statblock</button>';
    if (currentMonster && currentMonster.summary) {
        tabsHtml += '<button class="tab-btn' + (activeTab === 'summary' ? ' active' : '') + '" onclick="switchTab(\'summary\')">Summary</button>';
    }
    tabsHtml += '</div>';
    
    // Build tab panels
    var panelsHtml = '<div class="tab-panel" id="tab-statblock" style="' + (activeTab === 'statblock' ? '' : 'display:none') + '">' + statblockContent + '</div>';
    
    if (currentMonster && currentMonster.summary) {
        panelsHtml += '<div class="tab-panel" id="tab-summary" style="' + (activeTab === 'summary' ? '' : 'display:none') + '">' + buildSummaryHtml(currentMonster.summary) + '</div>';
    }
    
    container.innerHTML = buttonsHtml + tabsHtml + panelsHtml;
    
    // Re-attach restore upload listener (it was inside statblock content)
    var restoreInput = document.getElementById("restore-upload");
    if (restoreInput) {
        restoreInput.addEventListener("change", handleRestoreUpload);
    }
}

function switchTab(tab) {
    activeTab = tab;
    // Hide all panels
    var panels = document.querySelectorAll('.tab-panel');
    for (var i = 0; i < panels.length; i++) {
        panels[i].style.display = 'none';
    }
    // Show selected
    var active = document.getElementById('tab-' + tab);
    if (active) active.style.display = '';
    // Update tab buttons
    var btns = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
    }
    var activeBtn = document.querySelector('.tab-btn[onclick*="' + tab + '"]');
    if (activeBtn) activeBtn.classList.add('active');
}

// ============ SUMMARY / LORE BLOCK ============
function buildSummaryHtml(summary) {
    var html = '<div class="lore-block">';
    
    // Header — use monster name as primary, summary can override
    var summaryName = summary.name || (currentMonster ? currentMonster.name : 'Creature');
    html += '<h1 class="lore-title">' + summaryName + '</h1>';
    
    // Two-column layout
    html += '<div class="lore-columns">';
    
    // Column 1: Description, Legends & Lore, Encounters
    html += '<div class="lore-col lore-col-1">';
    
    // Description / flavor text
    if (summary.description) {
        html += '<div class="lore-description">' + summary.description + '</div>';
    }
    
    // Legends and Lore
    if (summary.legendsAndLore && summary.legendsAndLore.length > 0) {
        html += '<h2 class="lore-section-header">Legends and Lore</h2>';
        html += '<p class="lore-intro">With a History or Nature check, characters can learn the following:</p>';
        for (var i = 0; i < summary.legendsAndLore.length; i++) {
            var lore = summary.legendsAndLore[i];
            html += '<div class="lore-dc-entry"><strong>DC ' + lore.dc + '</strong> ' + lore.text + '</div>';
        }
    }
    
    // Encounters
    if (summary.encounters) {
        html += '<h2 class="lore-section-header">' + summaryName + ' Encounters</h2>';
        if (summary.encounters.description) {
            html += '<p class="lore-encounters-desc">' + summary.encounters.description + '</p>';
        }
        if (summary.encounters.groups && summary.encounters.groups.length > 0) {
            for (var i = 0; i < summary.encounters.groups.length; i++) {
                var enc = summary.encounters.groups[i];
                html += '<div class="lore-encounter-group">';
                html += '<div class="lore-encounter-cr"><strong>' + enc.cr + '</strong> ' + enc.creatures + '</div>';
                if (enc.treasure) {
                    html += '<div class="lore-encounter-treasure"><strong>Treasure</strong> ' + enc.treasure + '</div>';
                }
                html += '</div>';
            }
        }
    }
    
    html += '</div>'; // end col 1
    
    // Column 2: Signs, Behavior, Names, Loot, Image
    html += '<div class="lore-col lore-col-2">';
    
    // Signs
    if (summary.signs && summary.signs.length > 0) {
        html += '<h2 class="lore-section-header">Signs</h2>';
        html += '<table class="lore-table"><tbody>';
        for (var i = 0; i < summary.signs.length; i++) {
            var sign = summary.signs[i];
            html += '<tr><td class="lore-table-roll">' + sign.roll + '</td><td>' + sign.text + '</td></tr>';
        }
        html += '</tbody></table>';
    }
    
    // Behavior
    if (summary.behavior && summary.behavior.length > 0) {
        html += '<h2 class="lore-section-header">Behavior</h2>';
        html += '<table class="lore-table"><tbody>';
        for (var i = 0; i < summary.behavior.length; i++) {
            var beh = summary.behavior[i];
            html += '<tr><td class="lore-table-roll">' + beh.roll + '</td><td>' + beh.text + '</td></tr>';
        }
        html += '</tbody></table>';
    }
    
    // Names
    if (summary.names) {
        html += '<h2 class="lore-section-header">Names</h2>';
        html += '<p class="lore-names">' + summary.names + '</p>';
    }
    
    // Loot / Weapons, Armor & Items
    if (summary.loot) {
        html += '<h2 class="lore-section-header">' + (summary.loot.title || 'Weapons, Armor & Items') + '</h2>';
        if (summary.loot.description) {
            html += '<p class="lore-loot-desc">' + summary.loot.description + '</p>';
        }
        if (summary.loot.table && summary.loot.table.length > 0) {
            html += '<table class="lore-table lore-loot-table">';
            html += '<thead><tr><th>' + (summary.loot.dieType || 'd12') + '</th><th>Item(s)</th></tr></thead>';
            html += '<tbody>';
            for (var i = 0; i < summary.loot.table.length; i++) {
                var item = summary.loot.table[i];
                html += '<tr><td class="lore-table-roll">' + item.roll + '</td><td>' + item.text + '</td></tr>';
            }
            html += '</tbody></table>';
        }
    }
    
    // Image
    if (summary.image) {
        html += '<div class="lore-image-frame">';
        html += '<img src="' + summary.image + '" alt="' + (summary.name || 'Creature') + '" class="lore-image" />';
        html += '</div>';
    }
    
    html += '</div>'; // end col 2
    html += '</div>'; // end lore-columns
    html += '</div>'; // end lore-block
    
    return html;
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

function exportTemplate() {
    var template = {
        "monsterId": "unique_id_here",
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
        "villainActions": [],
        "summary": {
            "description": "A paragraph of flavor text about the creature.",
            "legendsAndLore": [
                { "dc": 10, "text": "Basic lore about the creature." },
                { "dc": 15, "text": "Deeper knowledge about the creature." },
                { "dc": 20, "text": "Rare or secret information." }
            ],
            "encounters": {
                "description": "Where the creature is typically found.",
                "groups": [
                    { "cr": "CR 0–2", "creatures": "1 creature", "treasure": "some coins" }
                ]
            },
            "signs": [
                { "roll": "1–2", "text": "A sign the creature is nearby." }
            ],
            "behavior": [
                { "roll": "1", "text": "What the creature is doing when found." }
            ],
            "names": "Example names for this creature type.",
            "loot": {
                "title": "Weapons, Armor & Items",
                "description": "Standard gear, and roll a d12:",
                "dieType": "d12",
                "table": [
                    { "roll": "1–6", "text": "Common item" },
                    { "roll": "7–12", "text": "Uncommon item" }
                ]
            }
        }
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
    var files = Array.from(e.target.files);
    if (!files.length) return;
    
    var monstersToProcess = [];
    var filesRead = 0;
    
    // Read all files first
    files.forEach(function(file) {
        var reader = new FileReader();
        reader.onload = function(event) {
            try {
                var data = JSON.parse(event.target.result);
                monstersToProcess.push(data);
            } catch (err) {
                showAlert("Error parsing " + file.name + ": " + err.message);
            }
            filesRead++;
            if (filesRead === files.length) {
                processUploadedMonsters(monstersToProcess);
            }
        };
        reader.readAsText(file);
    });
    
    e.target.value = '';
}

function processUploadedMonsters(monsterList) {
    if (monsterList.length === 0) return;
    
    // If only one monster uploaded, load it directly (original behavior)
    if (monsterList.length === 1) {
        var monster = monsterList[0];
        // Ensure it has a monsterId
        if (!monster.monsterId) {
            monster.monsterId = generateMonsterId();
        }
        currentMonster = monster;
        activeTab = 'statblock';
        renderStatBlock(monster);
        if (currentUser) {
            saveOrUpdateMonster(monster);
        }
        return;
    }
    
    // Multiple monsters — save all to Firestore
    if (!currentUser) {
        showAlert("Please sign in to bulk-upload monsters. For now, loading the first one.");
        var m = monsterList[0];
        if (!m.monsterId) m.monsterId = generateMonsterId();
        currentMonster = m;
        activeTab = 'statblock';
        renderStatBlock(m);
        return;
    }
    
    // Process each monster sequentially with duplicate checking
    processBulkUpload(monsterList, 0);
}

function processBulkUpload(monsterList, index) {
    if (index >= monsterList.length) {
        loadGroupsAndMonsters();
        showAlert("Uploaded " + monsterList.length + " monster(s) successfully.");
        // Load the last one
        var last = monsterList[monsterList.length - 1];
        currentMonster = last;
        activeTab = 'statblock';
        renderStatBlock(last);
        return;
    }
    
    var monster = monsterList[index];
    if (!monster.monsterId) {
        monster.monsterId = generateMonsterId();
    }
    
    // Check if this monsterId already exists in Firestore
    db.collection("users").doc(currentUser.uid).collection("monsters")
        .where("monsterId", "==", monster.monsterId)
        .get()
        .then(function(snapshot) {
            if (!snapshot.empty) {
                // Duplicate found — ask user
                var existingDoc = snapshot.docs[0];
                showConfirm('"' + monster.name + '" already exists. Replace it?', 
                    function() {
                        // Replace
                        monster.groupId = existingDoc.data().groupId || null;
                        db.collection("users").doc(currentUser.uid).collection("monsters")
                            .doc(existingDoc.id).set(monster)
                            .then(function() {
                                processBulkUpload(monsterList, index + 1);
                            });
                    },
                    function() {
                        // Skip
                        processBulkUpload(monsterList, index + 1);
                    }
                );
            } else {
                // New monster — save it
                monster.groupId = null;
                db.collection("users").doc(currentUser.uid).collection("monsters")
                    .add(monster)
                    .then(function() {
                        processBulkUpload(monsterList, index + 1);
                    });
            }
        })
        .catch(function(error) {
            console.error("Error checking duplicate:", error);
            processBulkUpload(monsterList, index + 1);
        });
}

function saveOrUpdateMonster(monster) {
    if (!currentUser) return;
    
    // Check if monsterId already exists
    db.collection("users").doc(currentUser.uid).collection("monsters")
        .where("monsterId", "==", monster.monsterId)
        .get()
        .then(function(snapshot) {
            if (!snapshot.empty) {
                // Update existing
                var existingDoc = snapshot.docs[0];
                monster.groupId = existingDoc.data().groupId || null;
                db.collection("users").doc(currentUser.uid).collection("monsters")
                    .doc(existingDoc.id).set(monster)
                    .then(function() {
                        currentMonsterDocId = existingDoc.id;
                        localStorage.setItem('lastMonsterDocId', existingDoc.id);
                        loadGroupsAndMonsters();
                    });
            } else {
                // Save as new
                saveMonster(monster);
            }
        })
        .catch(function(error) {
            console.error("Error checking for existing monster:", error);
            saveMonster(monster);
        });
}

function generateMonsterId() {
    return 'mon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
