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
        .add({ name: name, collapsed: false })
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
    var groupDiv = document.querySelector('[data-group-id="' + groupId + '"]');
    var monstersDiv = groupDiv.querySelector('.group-monsters');
    var toggle = groupDiv.querySelector('.group-toggle');
    
    if (monstersDiv.classList.contains('collapsed')) {
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

// Render Monster List
function renderMonsterList() {
    var container = document.getElementById("monster-list");
    var html = '';
    
    groups.forEach(function(group) {
        var groupMonsters = monsters.filter(function(m) { return m.groupId === group.id; });
        
        html += '<div class="monster-group" data-group-id="' + group.id + '">';
        html += '<div class="group-header" onclick="toggleGroup(\'' + group.id + '\')">';
        html += '<span class="group-toggle">▼</span>';
        html += '<span class="group-name">' + group.name + '</span>';
        html += '<button class="group-delete" onclick="event.stopPropagation(); deleteGroup(\'' + group.id + '\')">X</button>';
        html += '</div>';
        html += '<div class="group-monsters" data-group-id="' + group.id + '">';
        
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
    
    // Create an iframe to isolate from viewport constraints
    var iframe = document.createElement('iframe');
    iframe.style.cssText = `
        position: absolute;
        left: -9999px;
        top: 0;
        width: 900px;
        height: 2000px;
        border: none;
        visibility: visible;
    `;
    document.body.appendChild(iframe);
    
    var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Times New Roman', serif;
                    font-size: 14px;
                    line-height: 1.4;
                    background: white;
                    width: 900px;
                    overflow: visible;
                }
                .stat-block {
                    display: block !important;
                    width: 800px !important;
                    max-width: none !important;
                    min-width: 800px !important;
                    column-count: 2 !important;
                    column-gap: 40px !important;
                    column-rule: 1px solid #184e4f !important;
                    font-size: 14px !important;
                    padding: 20px !important;
                    background: #f5f5f5 !important;
                    border-top: 4px solid #184e4f !important;
                    border-bottom: 4px solid #184e4f !important;
                    box-shadow: none !important;
                    box-sizing: border-box !important;
                    overflow: visible !important;
                }
                .monster-name {
                    font-family: 'Times New Roman', serif;
                    font-size: 2em;
                    font-variant: small-caps;
                    font-weight: bold;
                    color: #184e4f;
                    margin: 0 0 0 0;
                    letter-spacing: 1px;
                }
                .monster-type { font-style: italic; margin: 0 0 10px 0; }
                .divider {
                    height: 4px;
                    background: linear-gradient(to right, #184e4f, #184e4f 60%, transparent);
                    margin: 10px 0;
                    border: none;
                }
                .stat-label { font-weight: bold; }
                .basic-stats p, .secondary-stats p { margin: 2px 0; }
                .abilities {
                    display: flex;
                    justify-content: space-between;
                    text-align: center;
                    margin: 10px 0;
                    color: #184e4f;
                }
                .ability { flex: 1; }
                .ability-name { font-weight: bold; text-transform: uppercase; font-size: 0.9em; }
                .ability-score { font-size: 1em; }
                .section-header {
                    font-size: 1.4em;
                    font-variant: small-caps;
                    color: #184e4f;
                    border-bottom: 2px solid #184e4f;
                    margin: 15px 0 5px 0;
                    padding-bottom: 2px;
                    break-after: avoid;
                }
                .feature, .action { margin: 10px 0; break-inside: avoid; }
                .feature-name, .action-name { font-weight: bold; font-style: italic; }
                .attack-type { font-style: italic; }
                .legendary-description { margin-bottom: 10px; }
                .legendary-action { margin: 5px 0; }
                .legendary-action-name { font-weight: bold; }
                .villain-action { margin: 5px 0; }
                .villain-action-round { font-weight: bold; font-style: italic; }
                .villain-action-name { font-weight: bold; font-style: italic; }
            </style>
        </head>
        <body></body>
        </html>
    `);
    iframeDoc.close();
    
    // Append clone to iframe body
    iframeDoc.body.appendChild(clone);
    
    // Force reflow
    void clone.offsetWidth;
    void clone.offsetHeight;
    
    return { clone: clone, container: iframe, iframeDoc: iframeDoc };
}

// Print PDF - WORKS ON BOTH MOBILE AND DESKTOP
function printStatBlock() {
    if (!currentMonster) {
        alert("Please load a monster first.");
        return;
    }
    
    var printElements = createPrintClone();
    var filename = currentMonster.name.replace(/[^a-z0-9]/gi, '_') + ".pdf";
    
    // Delay to ensure iframe content is fully rendered
    setTimeout(function() {
        var opt = {
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true, 
                width: 800,
                height: printElements.clone.scrollHeight,
                scrollX: 0,
                scrollY: 0,
                logging: false,
                foreignObjectRendering: false
            },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(printElements.clone).save().then(function() {
            document.body.removeChild(printElements.container);
        }).catch(function(error) {
            console.error("PDF generation error:", error);
            document.body.removeChild(printElements.container);
            alert("Error generating PDF. Please try again.");
        });
    }, 100);
}

// Print PNG - WORKS ON BOTH MOBILE AND DESKTOP
function printPNG() {
    if (!currentMonster) {
        alert("Please load a monster first.");
        return;
    }
    
    var printElements = createPrintClone();
    var filename = currentMonster.name.replace(/[^a-z0-9]/gi, '_') + ".png";
    
    // Delay to ensure iframe content is fully rendered
    setTimeout(function() {
        html2canvas(printElements.clone, { 
            scale: 2, 
            useCORS: true, 
            width: 800,
            height: printElements.clone.scrollHeight,
            scrollX: 0,
            scrollY: 0,
            logging: false,
            foreignObjectRendering: false
        }).then(function(canvas) {
            document.body.removeChild(printElements.container);
            
            var link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(function(error) {
            console.error("PNG generation error:", error);
            document.body.removeChild(printElements.container);
            alert("Error generating PNG. Please try again.");
        });
    }, 100);
}

// Export JSON
function exportJSON() {
    if (!currentMonster) {
        alert("Please load a monster first.");
        return;
    }
    
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
    if (mod >= 0) {
        return "+" + mod;
    } else {
        return "" + mod;
    }
}

function renderStatBlock(monster) {
    var container = document.getElementById("stat-block-container");
    var html = '';
    
    // Button row - now with responsive wrapper
    html += '<div class="button-row">';
    html += '<label for="json-upload" class="upload-btn">Upload JSON</label>';
    html += '<input type="file" id="json-upload" accept=".json" />';
    html += '<button class="print-btn" onclick="printStatBlock()">PDF</button>';
    html += '<button class="print-btn" onclick="printPNG()">PNG</button>';
    html += '<button class="export-btn" onclick="exportJSON()">Export</button>';
    if (currentUser) {
        html += '<button class="save-btn" onclick="saveMonster(currentMonster)">Save</button>';
    }
    html += '</div>';
    
    html += '<div class="stat-block">';
    
    // Name and Type
    html += '<h1 class="monster-name">' + monster.name + '</h1>';
    html += '<p class="monster-type">' + monster.size + ' ' + monster.type + ', ' + monster.alignment + '</p>';
    
    // Divider
    html += '<hr class="divider">';
    
    // Basic Stats
    html += '<div class="basic-stats">';
    html += '<p><span class="stat-label">Armor Class</span> ' + monster.ac + (monster.acType ? ' (' + monster.acType + ')' : '') + '</p>';
    html += '<p><span class="stat-label">Hit Points</span> ' + monster.hp + (monster.hpFormula ? ' (' + monster.hpFormula + ')' : '') + '</p>';
    html += '<p><span class="stat-label">Speed</span> ' + monster.speed + '</p>';
    html += '</div>';
    
    // Divider
    html += '<hr class="divider">';
    
    // Ability Scores
    html += '<div class="abilities">';
    var abilityNames = ["str", "dex", "con", "int", "wis", "cha"];
    for (var i = 0; i < abilityNames.length; i++) {
        var ability = abilityNames[i];
        var score = monster.abilities[ability];
        html += '<div class="ability">';
        html += '<div class="ability-name">' + ability.toUpperCase() + '</div>';
        html += '<div class="ability-score">' + score + ' (' + getMod(score) + ')</div>';
        html += '</div>';
    }
    html += '</div>';
    
    // Divider
    html += '<hr class="divider">';
    
    // Secondary Stats
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
    
    // Features
    if (monster.features && monster.features.length > 0) {
        html += '<hr class="divider">';
        for (var i = 0; i < monster.features.length; i++) {
            var feature = monster.features[i];
            html += '<div class="feature">';
            html += '<span class="feature-name">' + feature.name + '.</span> ';
            html += '<span class="feature-text">' + feature.text + '</span>';
            html += '</div>';
        }
    }
    
    // Actions
    if (monster.actions && monster.actions.length > 0) {
        html += '<h2 class="section-header">Actions</h2>';
        for (var i = 0; i < monster.actions.length; i++) {
            var action = monster.actions[i];
            html += '<div class="action">';
            html += '<span class="action-name">' + action.name + '.</span> ';
            if (action.attackType) {
                html += '<span class="attack-type">' + action.attackType + ':</span> ' + action.toHit + ', ' + action.reach + ', ' + action.target + '. ';
                html += '<span class="hit-label"><em>Hit:</em></span> ' + action.damage;
            } else {
                html += '<span class="action-text">' + action.text + '</span>';
            }
            html += '</div>';
        }
    }
    
    // Bonus Actions
    if (monster.bonusActions && monster.bonusActions.length > 0) {
        html += '<h2 class="section-header">Bonus Actions</h2>';
        for (var i = 0; i < monster.bonusActions.length; i++) {
            var action = monster.bonusActions[i];
            html += '<div class="action">';
            html += '<span class="action-name">' + action.name + '.</span> ';
            html += '<span class="action-text">' + action.text + '</span>';
            html += '</div>';
        }
    }
    
    // Reactions
    if (monster.reactions && monster.reactions.length > 0) {
        html += '<h2 class="section-header">Reactions</h2>';
        for (var i = 0; i < monster.reactions.length; i++) {
            var reaction = monster.reactions[i];
            html += '<div class="action">';
            html += '<span class="action-name">' + reaction.name + '.</span> ';
            html += '<span class="action-text">' + reaction.text + '</span>';
            html += '</div>';
        }
    }
    
    // Legendary Actions
    if (monster.legendaryActions && monster.legendaryActions.length > 0) {
        html += '<h2 class="section-header">Legendary Actions</h2>';
        if (monster.legendaryActionsDescription) {
            html += '<p class="legendary-description">' + monster.legendaryActionsDescription + '</p>';
        }
        for (var i = 0; i < monster.legendaryActions.length; i++) {
            var action = monster.legendaryActions[i];
            html += '<div class="legendary-action">';
            html += '<span class="legendary-action-name">' + action.name + '.</span> ';
            html += action.text;
            html += '</div>';
        }
    }
    
    // Lair Actions
    if (monster.lairActions && monster.lairActions.length > 0) {
        html += '<h2 class="section-header">Lair Actions</h2>';
        if (monster.lairActionsDescription) {
            html += '<p>' + monster.lairActionsDescription + '</p>';
        }
        html += '<ul>';
        for (var i = 0; i < monster.lairActions.length; i++) {
            html += '<li>' + monster.lairActions[i] + '</li>';
        }
        html += '</ul>';
    }

    // Villain Actions
    if (monster.villainActions && monster.villainActions.length > 0) {
        html += '<h2 class="section-header">Villain Actions</h2>';
        for (var i = 0; i < monster.villainActions.length; i++) {
            var action = monster.villainActions[i];
            html += '<div class="villain-action">';
            html += '<span class="villain-action-round">(Round ' + action.round + ')</span> ';
            html += '<span class="villain-action-name">' + action.name + '.</span> ';
            html += action.text;
            html += '</div>';
        }
    }
    
    html += '</div>';
    
    container.innerHTML = html;
    
    // Re-attach file upload listener since we recreated the element
    document.getElementById("json-upload").addEventListener("change", handleFileUpload);
}

function handleFileUpload(e) {
    var file = e.target.files[0];
    if (file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var monster = JSON.parse(e.target.result);
                currentMonster = monster;
                renderStatBlock(monster);
            } catch (err) {
                alert("Error parsing JSON file: " + err.message);
            }
        };
        reader.readAsText(file);
    }
}
