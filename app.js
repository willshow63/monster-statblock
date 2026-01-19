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

// Auth State Listener
auth.onAuthStateChanged(function(user) {
    if (user) {
        currentUser = user;
        document.getElementById("login-btn").style.display = "none";
        document.getElementById("user-info").style.display = "flex";
        document.getElementById("user-name").textContent = user.displayName;
        document.getElementById("saved-monsters").style.display = "block";
        loadSavedMonsters();
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

// Print button
document.getElementById("print-btn").addEventListener("click", function() {
    if (!currentMonster) {
        alert("Please load a monster first.");
        return;
    }
    window.print();
});

// Load Saved Monsters
function loadSavedMonsters() {
    if (!currentUser) return;
    
    db.collection("users").doc(currentUser.uid).collection("monsters")
        .orderBy("name")
        .get()
        .then(function(querySnapshot) {
            var list = document.getElementById("monster-list");
            list.innerHTML = "";
            
            querySnapshot.forEach(function(doc) {
                var monster = doc.data();
                var li = document.createElement("li");
                
                var nameBtn = document.createElement("button");
                nameBtn.className = "monster-name-btn";
                nameBtn.textContent = monster.name;
                nameBtn.onclick = function() {
                    loadMonster(doc.id);
                };
                
                var deleteBtn = document.createElement("button");
                deleteBtn.className = "delete-btn";
                deleteBtn.textContent = "X";
                deleteBtn.onclick = function(e) {
                    e.stopPropagation();
                    deleteMonster(doc.id, monster.name);
                };
                
                li.appendChild(nameBtn);
                li.appendChild(deleteBtn);
                list.appendChild(li);
            });
        })
        .catch(function(error) {
            console.error("Error loading monsters:", error);
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
    
    db.collection("users").doc(currentUser.uid).collection("monsters")
        .add(monster)
        .then(function() {
            alert("Monster saved!");
            loadSavedMonsters();
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
            loadSavedMonsters();
        })
        .catch(function(error) {
            console.error("Error deleting monster:", error);
        });
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
    
    // Save button (only if logged in)
    if (currentUser) {
        html += '<div class="save-btn-container"><button class="save-btn" onclick="saveMonster(currentMonster)">Save Monster</button></div>';
    }
    
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
}

// Event Listeners
document.getElementById("json-upload").addEventListener("change", function(e) {
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
});