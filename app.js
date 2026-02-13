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
var groups = [];
var monsters = [];
var expandedGroups = new Set(); // Track which groups are expanded (all start collapsed)

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
        alert("Login failed: " + error.message);
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
    if (!confirm("Delete this group? Monsters will be moved to ungrouped.")) return;
    
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
        alert("Please sign in to save monsters.");
        return;
    }
    
    var monsterData = Object.assign({}, monster);
    monsterData.groupId = null;
    
    db.collection("users").doc(currentUser.uid).collection("monsters")
        .add(monsterData)
        .then(function() {
            alert("Monster saved!");
            loadGroupsAndMonsters();
        })
        .catch(function(error) {
            console.error("Error saving monster:", error);
            alert("Error saving monster: " + error.message);
        });
}

// Delete Monster
function deleteMonster(docId, name) {
    if (!confirm("Delete " + name + "?")) return;
    
    db.collection("users").doc(currentUser.uid).collection("monsters").doc(docId)
        .delete()
        .then(function() {
            loadGroupsAndMonsters();
        })
        .catch(function(error) {
            console.error("Error deleting monster:", error);
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
    
    // Force the two-column flex layout at print width
    clone.style.cssText = 'display:flex!important;width:850px!important;max-width:none!important;min-width:850px!important;gap:40px!important;font-size:14px!important;padding:20px!important;background:#f5f5f5!important;border-top:4px solid #184e4f!important;border-bottom:4px solid #184e4f!important;box-shadow:none!important;box-sizing:border-box!important;overflow:visible!important;';
    
    // Style columns within the clone
    var cols = clone.querySelectorAll('.stat-col');
    if (cols.length === 2) {
        cols[0].style.cssText = 'flex:1;min-width:0;border-right:1px solid #184e4f;padding-right:20px;';
        cols[1].style.cssText = 'flex:1;min-width:0;padding-left:0;';
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
    if (!currentMonster) { alert("Please load a monster first."); return; }
    
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
            alert("Error generating PDF. Please try again.");
        });
    }, 300);
}

// Print PNG
function printPNG() {
    if (!currentMonster) { alert("Please load a monster first."); return; }
    
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
            alert("Error generating PNG. Please try again.");
        });
    }, 300);
}

// Export JSON
function exportJSON() {
    if (!currentMonster) { alert("Please load a monster first."); return; }
    
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

function buildActionsSection(monster) {
    if (!monster.actions || monster.actions.length === 0) return '';
    var html = '<div class="stat-section"><h2 class="section-header">Actions</h2>';
    for (var i = 0; i < monster.actions.length; i++) {
        var action = monster.actions[i];
        html += '<div class="action"><span class="action-name">' + action.name + '.</span> ';
        if (action.attackType) {
            html += '<span class="attack-type">' + action.attackType + ':</span> ' + action.toHit + ', ' + action.reach + ', ' + action.target + '. ';
            html += '<span class="hit-label"><em>Hit:</em></span> ' + action.damage;
        } else {
            html += '<span class="action-text">' + action.text + '</span>';
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function buildBonusActionsSection(monster) {
    if (!monster.bonusActions || monster.bonusActions.length === 0) return '';
    var html = '<div class="stat-section"><h2 class="section-header">Bonus Actions</h2>';
    for (var i = 0; i < monster.bonusActions.length; i++) {
        var action = monster.bonusActions[i];
        html += '<div class="action"><span class="action-name">' + action.name + '.</span> ';
        html += '<span class="action-text">' + action.text + '</span></div>';
    }
    html += '</div>';
    return html;
}

function buildReactionsSection(monster) {
    if (!monster.reactions || monster.reactions.length === 0) return '';
    var html = '<div class="stat-section"><h2 class="section-header">Reactions</h2>';
    for (var i = 0; i < monster.reactions.length; i++) {
        var reaction = monster.reactions[i];
        html += '<div class="action"><span class="action-name">' + reaction.name + '.</span> ';
        html += '<span class="action-text">' + reaction.text + '</span></div>';
    }
    html += '</div>';
    return html;
}

function buildLegendaryActionsSection(monster) {
    if (!monster.legendaryActions || monster.legendaryActions.length === 0) return '';
    var html = '<div class="stat-section"><h2 class="section-header">Legendary Actions</h2>';
    if (monster.legendaryActionsDescription) {
        html += '<p class="legendary-description">' + monster.legendaryActionsDescription + '</p>';
    }
    for (var i = 0; i < monster.legendaryActions.length; i++) {
        var action = monster.legendaryActions[i];
        html += '<div class="legendary-action"><span class="legendary-action-name">' + action.name + '.</span> ' + action.text + '</div>';
    }
    html += '</div>';
    return html;
}

function buildLairActionsSection(monster) {
    if (!monster.lairActions || monster.lairActions.length === 0) return '';
    var html = '<div class="stat-section"><h2 class="section-header">Lair Actions</h2>';
    if (monster.lairActionsDescription) {
        html += '<p>' + monster.lairActionsDescription + '</p>';
    }
    html += '<ul>';
    for (var i = 0; i < monster.lairActions.length; i++) {
        html += '<li>' + monster.lairActions[i] + '</li>';
    }
    html += '</ul></div>';
    return html;
}

function buildVillainActionsSection(monster) {
    if (!monster.villainActions || monster.villainActions.length === 0) return '';
    var html = '<div class="stat-section"><h2 class="section-header">Villain Actions</h2>';
    for (var i = 0; i < monster.villainActions.length; i++) {
        var action = monster.villainActions[i];
        html += '<div class="villain-action"><span class="villain-action-round">(Round ' + action.round + ')</span> ';
        html += '<span class="villain-action-name">' + action.name + '.</span> ' + action.text + '</div>';
    }
    html += '</div>';
    return html;
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
    
    // Button row (no upload btn - that's in the header now)
    var buttonsHtml = '<div class="button-row">';
    buttonsHtml += '<button class="print-btn" onclick="printStatBlock()">PDF</button>';
    buttonsHtml += '<button class="print-btn" onclick="printPNG()">PNG</button>';
    buttonsHtml += '<button class="export-btn" onclick="exportJSON()">Export</button>';
    if (currentUser) {
        buttonsHtml += '<button class="save-btn" onclick="saveMonster(currentMonster)">Save</button>';
    }
    buttonsHtml += '</div>';
    
    // Build all sections
    var headerHtml = buildHeaderSection(monster);
    var featuresHtml = buildFeaturesSection(monster);
    var actionsHtml = buildActionsSection(monster);
    var bonusActionsHtml = buildBonusActionsSection(monster);
    var reactionsHtml = buildReactionsSection(monster);
    var legendaryHtml = buildLegendaryActionsSection(monster);
    var lairHtml = buildLairActionsSection(monster);
    var villainHtml = buildVillainActionsSection(monster);
    
    // Collect sections in order: header+features always in col1,
    // then the remaining sections get distributed
    var col1Fixed = headerHtml + featuresHtml; // Always column 1
    
    var sections = [];
    if (actionsHtml) sections.push(actionsHtml);
    if (bonusActionsHtml) sections.push(bonusActionsHtml);
    if (reactionsHtml) sections.push(reactionsHtml);
    if (legendaryHtml) sections.push(legendaryHtml);
    if (lairHtml) sections.push(lairHtml);
    if (villainHtml) sections.push(villainHtml);
    
    // Measure total content height at single-column width (~380px per column)
    var colWidth = 380;
    var col1FixedHeight = measureSectionHeight(col1Fixed, colWidth);
    
    var sectionHeights = [];
    var totalSectionsHeight = 0;
    for (var i = 0; i < sections.length; i++) {
        var h = measureSectionHeight(sections[i], colWidth);
        sectionHeights.push(h);
        totalSectionsHeight += h;
    }
    
    var totalHeight = col1FixedHeight + totalSectionsHeight;
    
    // Decide: single column if total content is short enough
    // Threshold: if everything fits comfortably in one column, don't split
    var SINGLE_COL_THRESHOLD = 1000;
    
    if (totalHeight <= SINGLE_COL_THRESHOLD) {
        // Single column layout
        var html = buttonsHtml + '<div class="stat-block single-column"><div class="stat-col">';
        html += col1Fixed;
        for (var i = 0; i < sections.length; i++) {
            html += sections[i];
        }
        html += '</div></div>';
        container.innerHTML = html;
        return;
    }
    
    // Two-column layout: distribute sections to balance columns
    // Col 1 starts with header+features (mandatory)
    // Walk sections in order, deciding for each whether col1 or col2
    // produces better overall balance
    // Rule: col1 should never be shorter than col2
    var idealMidpoint = totalHeight / 2;
    
    var col1Height = col1FixedHeight;
    var col1Sections = [];
    var col2Sections = [];
    var splitFound = false;
    
    for (var i = 0; i < sections.length; i++) {
        if (splitFound) {
            col2Sections.push(sections[i]);
        } else {
            var heightIfAdded = col1Height + sectionHeights[i];
            
            // Calculate col2 height for each split option
            var col2HeightIfSplitHere = 0;
            var col2HeightIfSplitAfter = 0;
            for (var j = i; j < sections.length; j++) col2HeightIfSplitHere += sectionHeights[j];
            for (var j = i + 1; j < sections.length; j++) col2HeightIfSplitAfter += sectionHeights[j];
            
            // Never let col1 be shorter than col2
            if (col1Height < col2HeightIfSplitHere) {
                // Col1 would be shorter than col2 if we split here — keep adding
                col1Sections.push(sections[i]);
                col1Height = heightIfAdded;
            } else {
                // Col1 is already >= col2, pick whichever split is more balanced
                var imbalanceIfSplitHere = Math.abs(col1Height - col2HeightIfSplitHere);
                var imbalanceIfSplitAfter = Math.abs(heightIfAdded - col2HeightIfSplitAfter);
                
                if (imbalanceIfSplitAfter <= imbalanceIfSplitHere) {
                    col1Sections.push(sections[i]);
                    col1Height = heightIfAdded;
                } else {
                    splitFound = true;
                    col2Sections.push(sections[i]);
                }
            }
        }
    }
    
    // If nothing went to col2 (all sections fit better in col1), 
    // that's fine - col2 will just be shorter
    
    // Build the two-column HTML
    var html = buttonsHtml + '<div class="stat-block two-column">';
    html += '<div class="stat-col stat-col-1">';
    html += col1Fixed;
    for (var i = 0; i < col1Sections.length; i++) {
        html += col1Sections[i];
    }
    html += '</div>';
    html += '<div class="stat-col stat-col-2">';
    for (var i = 0; i < col2Sections.length; i++) {
        html += col2Sections[i];
    }
    html += '</div>';
    html += '</div>';
    
    container.innerHTML = html;
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
        "Use these instructions along with the included template.json to convert a D&D 5e",
        "monster or NPC character sheet into the proper JSON format for upload to the",
        "Monster Statblock Generator.",
        "",
        "RULES:",
        "",
        "1. Follow the template.json structure exactly. Do not add or rename any fields.",
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
        "10. Output ONLY valid JSON. No comments, no markdown, no explanation.",
        ""
    ].join("\n");

    // Download template.json
    var templateBlob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    var templateUrl = URL.createObjectURL(templateBlob);
    var a = document.createElement('a');
    a.href = templateUrl;
    a.download = 'statblock_template.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(templateUrl);

    // Download instructions.txt after a short delay
    setTimeout(function() {
        var instructionsBlob = new Blob([instructions], { type: 'text/plain' });
        var instructionsUrl = URL.createObjectURL(instructionsBlob);
        var b = document.createElement('a');
        b.href = instructionsUrl;
        b.download = 'statblock_instructions.txt';
        document.body.appendChild(b);
        b.click();
        document.body.removeChild(b);
        URL.revokeObjectURL(instructionsUrl);
    }, 300);
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
            } catch (err) {
                alert("Error parsing JSON file: " + err.message);
            }
        };
        reader.readAsText(file);
    }
    // Reset the input so the same file can be re-uploaded
    e.target.value = '';
}
