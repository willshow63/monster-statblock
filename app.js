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

// Sample Ancient Red Dragon data
var sampleMonster = {
    name: "Ancient Red Dragon",
    size: "Gargantuan",
    type: "Dragon",
    alignment: "Chaotic Evil",
    ac: 22,
    acType: "natural armor",
    hp: 546,
    hpFormula: "28d20 + 252",
    speed: "40 ft., climb 40ft., fly 80 ft.",
    abilities: {
        str: 30,
        dex: 10,
        con: 29,
        int: 18,
        wis: 15,
        cha: 23
    },
    savingThrows: "Dex +7, Con +16, Wis +9, Cha +13",
    skills: "Perception +16, Stealth +7",
    damageImmunities: "Fire",
    senses: "blindsight 60 ft., darkvision 120 ft., passive Perception 26",
    languages: "Common, Draconic",
    cr: "24",
    xp: "62,000",
    features: [
        {
            name: "Legendary Resistance (3/Day)",
            text: "If the dragon fails a saving throw, it can choose to succeed instead."
        }
    ],
    actions: [
        {
            name: "Multiattack",
            text: "The dragon can use its Frightful Presence. It then makes three attacks: one with its bite and two with its claws."
        },
        {
            name: "Bite",
            attackType: "Melee Weapon Attack",
            toHit: "+17 to hit",
            reach: "reach 15 ft.",
            target: "one target",
            damage: "21 (2d10 + 10) piercing damage plus 14 (4d6) fire damage."
        },
        {
            name: "Claws",
            attackType: "Melee Weapon Attack",
            toHit: "+17 to hit",
            reach: "reach 10 ft.",
            target: "one target",
            damage: "17 (2d6 + 10) slashing damage."
        },
        {
            name: "Tail",
            attackType: "Melee Weapon Attack",
            toHit: "+17 to hit",
            reach: "reach 20 ft.",
            target: "one creature",
            damage: "19 (2d8 + 10) bludgeoning damage."
        },
        {
            name: "Frightful Presence",
            text: "Each creature of the dragon's choice that is within 120 feet of the dragon and aware of it must succeed on a DC 21 Wisdom saving throw or become frightened for 1 minute. A creature can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success. If a creature's saving throw is successful or the effect ends for it, the creature is immune to the dragon's Frightful Presence for the next 24 hours."
        },
        {
            name: "Fire Breath (Recharge 5-6)",
            text: "The dragon exhales fire in a 90-foot cone. Each creature in that area must make a DC 24 Dexterity saving throw, taking 91 (26d6) fire damage on a failed save, or half as much damage on a successful one."
        }
    ],
    legendaryActionsPerRound: 3,
    legendaryActionsDescription: "The Ancient Red Dragon can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The Ancient Red Dragon regains spent legendary actions at the start of its turn.",
    legendaryActions: [
        {
            name: "Detect",
            text: "The dragon makes a Wisdom (Perception) check."
        },
        {
            name: "Tail Attack",
            text: "The dragon makes a tail attack."
        },
        {
            name: "Wing Attack (Costs 2 Actions)",
            text: "The dragon beats its wings. Each creature within 15 feet of the dragon must succeed on a DC 25 Dexterity saving throw or take 17 (2d6+10) bludgeoning damage and be knocked prone. The dragon can then fly up to half its flying speed."
        }
    ],
    villainActions: [
        {
            round: 1,
            name: "Burrow",
            text: "The ankheg burrows into the ground using its burrowing speed."
        },
        {
            round: 2,
            name: "Pull Under",
            text: "If the ankheg is directly under a large or smaller creature, they must make a DC 13 strength saving throw or be pulled into the tunnel."
        },
        {
            round: 3,
            name: "Acid Expulsion",
            text: "The ankheg swells up before blasting its acid blood from the many holes poked in it throughout the battle. Each creature within 30 feet of the ankheg must succeed on a DC 13 Dexterity saving throw or take acid damage equal to half of the ankheg's missing hit points."
        }
    ]
};

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

document.getElementById("sample-btn").addEventListener("click", function() {
    currentMonster = sampleMonster;
    renderStatBlock(sampleMonster);
});