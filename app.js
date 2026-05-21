// Supabase Configuration
var SUPABASE_URL = 'https://cvtddvfglskmfkzjuepn.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2dGRkdmZnbHNrbWZremp1ZXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Mzk4ODYsImV4cCI6MjA5MTMxNTg4Nn0.z1Fn809NV5gBkLwYzH0AbqgskpID_nBmTyCyBVHcqWo';

// Initialize Supabase
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var currentUser = null;
var currentMonster = null;
var currentMonsterDocId = null;
var sharedView = false;
var groups = [];
var monsters = [];
var expandedGroups = new Set(); // Track which groups are expanded (all start collapsed)
var sidebarOpen = false;
var activeTab = 'statblock';
var selectMode = false;
var columnMode = localStorage.getItem('columnMode') || 'double';
var theme = localStorage.getItem('theme') || 'green';
document.documentElement.setAttribute('data-theme', theme);

function getThemeColor() {
    var c = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();
    return c || '#184e4f';
}
function getThemeColorDark() {
    var c = getComputedStyle(document.documentElement).getPropertyValue('--theme-color-dark').trim();
    return c || '#0d3536';
}

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
            delete saveData.groupId;
            sb.from('monsters').update({
                name: currentMonster.name,
                monster_id: currentMonster.monsterId || null,
                data: saveData
            }).eq('id', currentMonsterDocId)
                .then(function(result) {
                    if (result.error) throw result.error;
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
sb.auth.onAuthStateChange(function(event, session) {
    if (sharedView) return;
    if (session && session.user) {
        currentUser = session.user;
        document.getElementById("login-btn").style.display = "none";
        document.getElementById("user-info").style.display = "flex";
        document.getElementById("user-name").textContent = session.user.user_metadata.full_name || session.user.email;
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
    sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + window.location.pathname
        }
    }).then(function(result) {
        if (result.error) {
            console.error("Login error:", result.error);
            showAlert("Login failed: " + result.error.message);
        }
    });
});

// Logout
document.getElementById("logout-btn").addEventListener("click", function() {
    sb.auth.signOut();
});

// Shared View — check URL for ?view=slug on page load
(function() {
    var params = new URLSearchParams(window.location.search);
    var viewSlug = params.get('view');
    if (viewSlug) {
        sharedView = true;
        document.querySelector('.controls').style.display = 'none';
        document.getElementById('saved-monsters').style.display = 'none';
        sb.from('monsters').select('*').eq('slug', viewSlug).eq('public', true).single()
            .then(function(result) {
                if (result.error || !result.data) {
                    document.getElementById('stat-block-container').innerHTML = '<p style="padding:40px;font-family:Times New Roman,serif;font-size:18px;">Monster not found.</p>';
                    return;
                }
                var monster = result.data.data;
                monster.groupId = result.data.group_id;
                currentMonster = monster;
                currentMonsterDocId = result.data.id;
                activeTab = 'statblock';
                renderStatBlock(monster);
            });
    }
})();

// Share / Unshare a monster
function generateSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function shareMonster() {
    if (!currentUser || !currentMonsterDocId || !currentMonster) return;
    var slug = generateSlug(currentMonster.name);
    var url = window.location.origin + '/monster-statblock/' + slug;
    sb.from('monsters').update({ public: true, slug: slug }).eq('id', currentMonsterDocId)
        .then(function(result) {
            if (result.error) {
                showAlert('Error sharing: ' + result.error.message);
                return;
            }
            showSharePopup(url);
        });
}

function showSharePopup(url) {
    var existing = document.getElementById('share-popup-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'share-popup-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000;';

    var box = document.createElement('div');
    box.style.cssText = 'background:white;border-radius:8px;padding:24px;max-width:420px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.2);';

    var urlRow = document.createElement('div');
    urlRow.style.cssText = 'display:flex;align-items:center;gap:8px;background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:10px 12px;margin-bottom:16px;';

    var urlText = document.createElement('span');
    urlText.textContent = url;
    urlText.style.cssText = 'flex:1;font-size:14px;color:#333;word-break:break-all;font-family:sans-serif;';

    var copyBtn = document.createElement('button');
    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#888" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1.5 1.5 0 00-1.5-1.5H3.5A1.5 1.5 0 002 3.5V9a1.5 1.5 0 001.5 1.5h2"/></svg>';
    copyBtn.title = 'Copy link';
    copyBtn.style.cssText = 'background:none;border:1px solid #ddd;border-radius:4px;cursor:pointer;padding:4px 6px;flex-shrink:0;display:flex;align-items:center;';
    copyBtn.addEventListener('click', function() {
        navigator.clipboard.writeText(url);
        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="' + getThemeColor() + '" stroke-width="2"><path d="M3 8.5l3 3 7-7"/></svg>';
        setTimeout(function() { copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#888" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1.5 1.5 0 00-1.5-1.5H3.5A1.5 1.5 0 002 3.5V9a1.5 1.5 0 001.5 1.5h2"/></svg>'; }, 1500);
    });

    urlRow.appendChild(urlText);
    urlRow.appendChild(copyBtn);

    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Done';
    closeBtn.style.cssText = 'display:block;margin-left:auto;padding:6px 20px;background:' + getThemeColor() + ';color:white;border:none;border-radius:6px;font-size:13px;font-family:sans-serif;cursor:pointer;';
    closeBtn.addEventListener('click', function() { overlay.remove(); });

    box.appendChild(urlRow);
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function unshareMonster() {
    if (!currentUser || !currentMonsterDocId) return;
    sb.from('monsters').update({ public: false, slug: null }).eq('id', currentMonsterDocId)
        .then(function(result) {
            if (result.error) {
                showAlert('Error unsharing: ' + result.error.message);
                return;
            }
            showAlert('Monster is no longer shared.');
        });
}

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

    sb.from('groups').insert({ user_id: currentUser.id, name: name })
        .then(function(result) {
            if (result.error) throw result.error;
            loadGroupsAndMonsters();
        })
        .catch(function(error) {
            console.error("Error creating group:", error);
        });
}

// Delete Group
function showGroupMenu(groupId, groupName, btnEl) {
    // Remove any existing menu
    var existing = document.querySelector('.group-menu-popup');
    if (existing) existing.remove();
    
    var menu = document.createElement('div');
    menu.className = 'group-menu-popup';
    
    var renameBtn = document.createElement('button');
    renameBtn.textContent = 'Rename';
    renameBtn.className = 'group-menu-item';
    renameBtn.onclick = function(e) {
        e.stopPropagation();
        menu.remove();
        renameGroup(groupId, groupName);
    };
    
    var deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'group-menu-item group-menu-delete';
    deleteBtn.onclick = function(e) {
        e.stopPropagation();
        menu.remove();
        deleteGroupPrompt(groupId, groupName);
    };
    
    menu.appendChild(renameBtn);
    menu.appendChild(deleteBtn);
    
    // Position next to the button
    btnEl.parentElement.style.position = 'relative';
    btnEl.parentElement.appendChild(menu);
    
    // Close on outside click
    setTimeout(function() {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

function renameGroup(groupId, currentName) {
    // Use a modal approach — create a simple input modal
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    
    var box = document.createElement('div');
    box.className = 'modal-box';
    
    var msg = document.createElement('p');
    msg.className = 'modal-message';
    msg.textContent = 'Rename group:';
    
    var input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'group-rename-input';
    input.style.cssText = 'width:100%;padding:6px 8px;margin:8px 0;border:1px solid #ccc;border-radius:4px;font-family:Times New Roman,serif;font-size:14px;';
    
    var btnRow = document.createElement('div');
    btnRow.className = 'modal-buttons';
    
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.onclick = function() { overlay.remove(); };
    
    var saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'modal-btn modal-btn-confirm';
    saveBtn.onclick = function() {
        var newName = input.value.trim();
        if (!newName) return;
        if (newName === currentName) { overlay.remove(); return; }
        sb.from('groups').update({ name: newName }).eq('id', groupId)
            .then(function(result) {
                if (result.error) throw result.error;
                overlay.remove();
                loadGroupsAndMonsters();
            })
            .catch(function(error) {
                console.error("Error renaming group:", error);
                showAlert("Error renaming group: " + error.message);
            });
    };
    
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') saveBtn.click();
        if (e.key === 'Escape') overlay.remove();
    });
    
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    box.appendChild(msg);
    box.appendChild(input);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    
    input.focus();
    input.select();
}

function deleteGroupPrompt(groupId, groupName) {
    // Count monsters in this group
    var groupMonsters = monsters.filter(function(m) { return m.groupId === groupId; });
    
    if (groupMonsters.length === 0) {
        // No monsters — just delete the group
        showConfirm('Delete group "' + groupName + '"?', function() {
            expandedGroups.delete(groupId);
            sb.from('groups').delete().eq('id', groupId)
                .then(function(result) { if (result.error) throw result.error; loadGroupsAndMonsters(); });
        });
        return;
    }
    
    // Has monsters — show choice modal
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    
    var box = document.createElement('div');
    box.className = 'modal-box';
    
    var msg = document.createElement('p');
    msg.className = 'modal-message';
    msg.textContent = 'Delete group "' + groupName + '"? It contains ' + groupMonsters.length + ' monster' + (groupMonsters.length > 1 ? 's' : '') + '.';
    
    var btnRow = document.createElement('div');
    btnRow.className = 'modal-buttons';
    btnRow.style.flexWrap = 'wrap';
    btnRow.style.gap = '6px';
    
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.onclick = function() { overlay.remove(); };
    
    var moveBtn = document.createElement('button');
    moveBtn.textContent = 'Move to Ungrouped';
    moveBtn.className = 'modal-btn modal-btn-confirm';
    moveBtn.onclick = function() {
        overlay.remove();
        expandedGroups.delete(groupId);
        // Move monsters to ungrouped, then delete group
        sb.from('monsters').update({ group_id: null }).eq('group_id', groupId)
            .then(function(result) {
                if (result.error) throw result.error;
                return sb.from('groups').delete().eq('id', groupId);
            })
            .then(function(result) {
                if (result.error) throw result.error;
                loadGroupsAndMonsters();
            });
    };
    
    var deleteAllBtn = document.createElement('button');
    deleteAllBtn.textContent = 'Delete All Monsters';
    deleteAllBtn.className = 'modal-btn modal-btn-danger';
    deleteAllBtn.onclick = function() {
        overlay.remove();
        expandedGroups.delete(groupId);
        // Delete all monsters in group, then delete group
        sb.from('monsters').delete().eq('group_id', groupId)
            .then(function(result) {
                if (result.error) throw result.error;
                return sb.from('groups').delete().eq('id', groupId);
            })
            .then(function(result) {
                if (result.error) throw result.error;
                loadGroupsAndMonsters();
            });
    };
    
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(moveBtn);
    btnRow.appendChild(deleteAllBtn);
    box.appendChild(msg);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// Keep old function for backward compat
function deleteGroup(groupId) {
    deleteGroupPrompt(groupId, 'this group');
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

    sb.from('groups').select('id, name').order('name')
        .then(function(result) {
            if (result.error) throw result.error;
            groups = result.data;

            return sb.from('monsters').select('id, name, monster_id, group_id').order('name');
        })
        .then(function(result) {
            if (result.error) throw result.error;
            monsters = result.data.map(function(row) {
                return { id: row.id, name: row.name, monsterId: row.monster_id, groupId: row.group_id };
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
    
    // Select mode bar
    if (selectMode) {
        html += '<div class="select-mode-bar">';
        html += '<span class="select-mode-count" id="select-count">0 selected</span>';
        html += '<button class="select-all-btn" onclick="selectAllMonsters()">Select All</button>';
        html += '<button class="delete-selected-btn" onclick="deleteSelectedMonsters()">Delete Selected</button>';
        html += '<button class="cancel-select-btn" onclick="toggleSelectMode()">Cancel</button>';
        html += '</div>';
    }
    
    groups.forEach(function(group) {
        var groupMonsters = monsters.filter(function(m) { return m.groupId === group.id; });
        var isExpanded = expandedGroups.has(group.id);
        
        html += '<div class="monster-group" data-group-id="' + group.id + '">';
        html += '<div class="group-header" onclick="toggleGroup(\'' + group.id + '\')">';
        html += '<span class="group-toggle">' + (isExpanded ? '▼' : '►') + '</span>';
        html += '<span class="group-name">' + group.name + '</span>';
        html += '<button class="group-edit-btn" onclick="event.stopPropagation(); showGroupMenu(\'' + group.id + '\', \'' + group.name.replace(/'/g, "\\'") + '\', this)" title="Edit group">&#9998;</button>';
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
    html += '<input type="checkbox" class="monster-select-cb" data-monster-id="' + monster.id + '" data-monster-name="' + monster.name.replace(/"/g, '&quot;') + '" style="' + (selectMode ? '' : 'display:none') + '" onclick="event.stopPropagation(); updateDeleteCount()" />';
    html += '<button class="monster-name-btn" onclick="loadMonster(\'' + monster.id + '\')">' + monster.name + '</button>';
    html += '</div>';
    return html;
}

function toggleSelectMode() {
    selectMode = !selectMode;
    renderMonsterList();
    var btn = document.getElementById('select-mode-toggle');
    if (btn) {
        btn.textContent = selectMode ? 'Cancel' : 'Select';
        btn.classList.toggle('active', selectMode);
    }
}

function updateDeleteCount() {
    var checked = document.querySelectorAll('.monster-select-cb:checked');
    var countEl = document.getElementById('select-count');
    if (countEl) {
        countEl.textContent = checked.length + ' selected';
    }
}

function selectAllMonsters() {
    var cbs = document.querySelectorAll('.monster-select-cb');
    var allChecked = true;
    for (var i = 0; i < cbs.length; i++) {
        if (!cbs[i].checked) { allChecked = false; break; }
    }
    for (var i = 0; i < cbs.length; i++) {
        cbs[i].checked = !allChecked;
    }
    updateDeleteCount();
}

function deleteSelectedMonsters() {
    var checked = document.querySelectorAll('.monster-select-cb:checked');
    if (checked.length === 0) {
        showAlert("No monsters selected.");
        return;
    }
    
    var names = [];
    var ids = [];
    for (var i = 0; i < checked.length; i++) {
        ids.push(checked[i].getAttribute('data-monster-id'));
        names.push(checked[i].getAttribute('data-monster-name'));
    }
    
    var msg = 'Delete ' + ids.length + ' monster' + (ids.length > 1 ? 's' : '') + '?';
    if (ids.length <= 5) {
        msg += '\n' + names.join(', ');
    }
    
    showConfirm(msg, function() {
        sb.from('monsters').delete().in('id', ids)
            .then(function(result) {
                if (result.error) throw result.error;
                selectMode = false;
                loadGroupsAndMonsters();
                showAlert(ids.length + ' monster' + (ids.length > 1 ? 's' : '') + ' deleted.');
            }).catch(function(error) {
                console.error("Error deleting monsters:", error);
                showAlert("Error deleting monsters: " + error.message);
            });
    });
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
    sb.from('monsters').update({ group_id: groupId }).eq('id', monsterId)
        .then(function(result) {
            if (result.error) throw result.error;
            loadGroupsAndMonsters();
        })
        .catch(function(error) {
            console.error("Error moving monster:", error);
        });
}

// Load a specific monster
function loadMonster(docId) {
    sb.from('monsters').select('*').eq('id', docId).single()
        .then(function(result) {
            if (result.error) throw result.error;
            if (result.data) {
                var monster = result.data.data; // the JSONB column
                monster.groupId = result.data.group_id;
                currentMonster = monster;
                currentMonsterDocId = result.data.id;
                localStorage.setItem('lastMonsterDocId', result.data.id);
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
    delete monsterData.groupId;

    sb.from('monsters').insert({
        user_id: currentUser.id,
        group_id: null,
        monster_id: monster.monsterId || null,
        name: monster.name,
        data: monsterData
    }).select().single()
        .then(function(result) {
            if (result.error) throw result.error;
            currentMonsterDocId = result.data.id;
            localStorage.setItem('lastMonsterDocId', result.data.id);
            showAlert(monster.name + " saved!");
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
        sb.from('monsters').delete().eq('id', docId)
            .then(function(result) {
                if (result.error) throw result.error;
                loadGroupsAndMonsters();
            })
            .catch(function(error) {
                console.error("Error deleting monster:", error);
            });
    });
}

function deleteCurrentMonster() {
    if (!currentMonster || !currentMonsterDocId) {
        showAlert("No monster is currently loaded.");
        return;
    }
    if (!currentUser) {
        showAlert("Please sign in to delete monsters.");
        return;
    }
    showConfirm('Delete "' + currentMonster.name + '"?', function() {
        sb.from('monsters').delete().eq('id', currentMonsterDocId)
            .then(function(result) {
                if (result.error) throw result.error;
                currentMonster = null;
                currentMonsterDocId = null;
                document.getElementById("stat-block-container").innerHTML = '';
                loadGroupsAndMonsters();
                showAlert("Monster deleted.");
            })
            .catch(function(error) {
                console.error("Error deleting monster:", error);
                showAlert("Error deleting monster: " + error.message);
            });
    });
}

function replaceDividersWithSvg(clone, themeColor) {
    var hrDividers = clone.querySelectorAll('.divider');
    for (var d = 0; d < hrDividers.length; d++) {
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'height:4px;margin:10px 0;line-height:0;font-size:0;';
        var gradId = 'dg_' + d + '_' + Math.floor(Math.random() * 100000);
        wrapper.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="4" preserveAspectRatio="none">' +
            '<defs>' +
                '<linearGradient id="' + gradId + '" x1="0" y1="0" x2="1" y2="0">' +
                    '<stop offset="0%" stop-color="' + themeColor + '" stop-opacity="1"/>' +
                    '<stop offset="55%" stop-color="' + themeColor + '" stop-opacity="1"/>' +
                    '<stop offset="95%" stop-color="' + themeColor + '" stop-opacity="0"/>' +
                '</linearGradient>' +
            '</defs>' +
            '<rect width="100%" height="4" fill="url(#' + gradId + ')"/>' +
        '</svg>';
        hrDividers[d].parentNode.replaceChild(wrapper, hrDividers[d]);
    }
}

function whenFontsReady(callback) {
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready.then(callback);
    } else {
        callback();
    }
}

// Create a consistent clone for printing - WORKS ON BOTH MOBILE AND DESKTOP
function createPrintClone(opts) {
    opts = opts || {};
    var includeShadow = !!opts.includeShadow;
    var SHADOW_BUFFER = 25; // px of transparent space around the box to fit the box-shadow
    var SHADOW_CSS = '0 0 10px rgba(0,0,0,0.2)';

    var isSummary = activeTab === 'summary';
    var element = isSummary
        ? document.getElementById('tab-summary')
        : document.querySelector('.stat-block');
    if (!element) return null;
    var clone = element.cloneNode(true);
    // Avoid duplicate id when appended to document body
    if (clone.id) clone.removeAttribute('id');

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
    var wrapperBg = includeShadow ? '#f5f5f5' : 'white';
    wrapper.style.cssText = 'position:absolute;left:0;top:0;width:1000px;background:' + wrapperBg + ';z-index:9999;overflow:visible;';

    var themeColor = getThemeColor();
    var width;
    var shadowDecl = includeShadow ? 'box-shadow:' + SHADOW_CSS + '!important;' : 'box-shadow:none!important;';

    if (isSummary) {
        // Summary: tab panel wrapping one or more .lore-block pages. Inner blocks
        // already carry their own styling (including theme-colored borders via CSS vars).
        width = 840;
        clone.style.cssText = 'display:block!important;width:840px!important;padding:0!important;margin:0!important;background:transparent!important;box-shadow:none!important;';
        if (includeShadow) {
            var loreBlocks = clone.querySelectorAll('.lore-block');
            for (var lb = 0; lb < loreBlocks.length; lb++) {
                loreBlocks[lb].style.boxShadow = SHADOW_CSS;
            }
        }
    } else if (element.classList.contains('two-column')) {
        width = 840;
        clone.style.cssText = 'display:flex!important;position:relative!important;width:840px!important;max-width:none!important;min-width:840px!important;gap:40px!important;font-size:14px!important;padding:20px!important;background:#f5f5f5!important;border-top:4px solid ' + themeColor + '!important;border-bottom:4px solid ' + themeColor + '!important;' + shadowDecl + 'box-sizing:border-box!important;overflow:visible!important;';
        var cols = clone.querySelectorAll('.stat-col');
        for (var i = 0; i < cols.length; i++) {
            if (cols[i].classList.contains('stat-col-1')) {
                cols[i].style.cssText = 'flex:1!important;min-width:0!important;padding-right:20px!important;transform:translateX(8px)!important;';
            } else {
                cols[i].style.cssText = 'flex:1!important;min-width:0!important;padding-left:4px!important;padding-right:16px!important;transform:translateX(5px)!important;';
            }
        }
        var divider = clone.querySelector('.stat-col-divider');
        if (divider) {
            divider.style.cssText = 'position:absolute!important;top:20px!important;bottom:20px!important;left:50%!important;width:1px!important;margin-left:-0.5px!important;background:' + themeColor + '!important;';
        }
        // html2canvas mis-renders the CSS linear-gradient on .divider — swap in an SVG equivalent
        replaceDividersWithSvg(clone, themeColor);
    } else {
        width = 450;
        clone.style.cssText = 'display:block!important;width:450px!important;max-width:none!important;font-size:14px!important;padding:20px!important;background:#f5f5f5!important;border-top:4px solid ' + themeColor + '!important;border-bottom:4px solid ' + themeColor + '!important;' + shadowDecl + 'box-sizing:border-box!important;overflow:visible!important;';
        replaceDividersWithSvg(clone, themeColor);
    }

    var captureTarget = clone;
    if (includeShadow) {
        // Wrap the clone in an outer transparent-padded div so html2canvas captures
        // the shadow that overflows the clone's box.
        var shadowWrapper = document.createElement('div');
        shadowWrapper.style.cssText = 'display:inline-block;padding:' + SHADOW_BUFFER + 'px;background:#f5f5f5;';
        shadowWrapper.appendChild(clone);
        wrapper.appendChild(shadowWrapper);
        captureTarget = shadowWrapper;
        width += 2 * SHADOW_BUFFER;
    } else {
        wrapper.appendChild(clone);
    }
    document.body.appendChild(wrapper);

    void clone.offsetWidth;
    void clone.offsetHeight;

    return { clone: captureTarget, innerClone: clone, container: wrapper, viewportMeta: viewportMeta, originalViewport: originalViewport, width: width, isSummary: isSummary, includeShadow: includeShadow };
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
    if (!printElements) { showAlert("Nothing to export."); return; }
    var baseName = currentMonster.name.replace(/[^a-z0-9]/gi, '_');
    var filename = baseName + (printElements.isSummary ? "_summary" : "") + ".pdf";

    whenFontsReady(function() { setTimeout(function() {
        void printElements.clone.offsetWidth;
        // Measure true height - for flex layouts, check both column heights
        var cloneHeight = printElements.clone.scrollHeight;
        var cols = printElements.clone.querySelectorAll('.stat-col');
        if (cols.length === 2) {
            var col1H = cols[0].scrollHeight;
            var col2H = cols[1].scrollHeight;
            var maxColH = Math.max(col1H, col2H);
            cloneHeight = Math.max(cloneHeight, maxColH + 48);
        }
        var cloneWidth = printElements.width;

        // Render to canvas first, then scale to fit one page
        html2canvas(printElements.clone, { scale: 2, useCORS: true, logging: false, width: cloneWidth, height: cloneHeight, scrollX: 0, scrollY: 0 })
        .then(function(canvas) {
            cleanupPrintClone(printElements);
            
            // Letter page in points: 612 x 792
            // With 0.5in margins: usable area = 540 x 720 points (7.5 x 10 inches)
            var pageW = 7.5; // inches usable
            var pageH = 10;  // inches usable
            var margin = 0.5; // inches
            
            var imgW = canvas.width;
            var imgH = canvas.height;
            var aspectRatio = imgW / imgH;
            
            // Start with full width
            var fitW = pageW;
            var fitH = fitW / aspectRatio;
            
            // If too tall, shrink to fit height
            if (fitH > pageH) {
                fitH = pageH;
                fitW = fitH * aspectRatio;
            }
            
            // Center horizontally on page
            var xOffset = margin + (pageW - fitW) / 2;
            var yOffset = margin + (pageH - fitH) / 2;
            
            var JsPDF = (typeof jspdf !== 'undefined' && jspdf.jsPDF) ? jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
            if (!JsPDF) { showAlert("PDF library not loaded."); return; }
            var pdf = new JsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
            var imgData = canvas.toDataURL('image/jpeg', 0.98);
            pdf.addImage(imgData, 'JPEG', xOffset, yOffset, fitW, fitH);
            pdf.save(filename);
        }).catch(function(error) {
            console.error("PDF generation error:", error);
            cleanupPrintClone(printElements);
            showAlert("Error generating PDF. Please try again.");
        });
    }, 300); });
}

// Print PNG (plain, no shadow)
function printPNG() {
    if (!currentMonster) { showAlert("Please load a monster first."); return; }

    var printElements = createPrintClone();
    if (!printElements) { showAlert("Nothing to export."); return; }
    var baseName = currentMonster.name.replace(/[^a-z0-9]/gi, '_');
    var filename = baseName + (printElements.isSummary ? "_summary" : "") + ".png";

    whenFontsReady(function() { setTimeout(function() {
        void printElements.clone.offsetWidth;
        var cloneHeight = printElements.clone.scrollHeight;
        var cols = printElements.clone.querySelectorAll('.stat-col');
        if (cols.length === 2) {
            var col1H = cols[0].scrollHeight;
            var col2H = cols[1].scrollHeight;
            var maxColH = Math.max(col1H, col2H);
            cloneHeight = Math.max(cloneHeight, maxColH + 48);
        }
        var cloneWidth = printElements.width;

        html2canvas(printElements.clone, { scale: 2, useCORS: true, logging: false, width: cloneWidth, height: cloneHeight, scrollX: 0, scrollY: 0 })
        .then(function(canvas) {
            cleanupPrintClone(printElements);
            var cropped = document.createElement('canvas');
            cropped.width = canvas.width;
            cropped.height = Math.max(1, canvas.height - 4);
            cropped.getContext('2d').drawImage(canvas, 0, 0);
            var link = document.createElement('a');
            link.download = filename;
            link.href = cropped.toDataURL('image/png');
            link.click();
        }).catch(function(error) {
            console.error("PNG generation error:", error);
            cleanupPrintClone(printElements);
            showAlert("Error generating PNG. Please try again.");
        });
    }, 300); });
}

// Print PNG with shadow halo flattened onto #f5f5f5.
// We do NOT rely on html2canvas's box-shadow rendering (which is unreliable);
// instead we capture the box plain, then paint it onto a larger output canvas
// using canvas shadow APIs.
function printPNGWithShadow() {
    if (!currentMonster) { showAlert("Please load a monster first."); return; }

    var printElements = createPrintClone();
    if (!printElements) { showAlert("Nothing to export."); return; }
    var baseName = currentMonster.name.replace(/[^a-z0-9]/gi, '_');
    var filename = baseName + (printElements.isSummary ? "_summary" : "") + "_shadow.png";

    whenFontsReady(function() { setTimeout(function() {
        void printElements.clone.offsetWidth;
        var cloneHeight = printElements.clone.scrollHeight;
        var cols = printElements.clone.querySelectorAll('.stat-col');
        if (cols.length === 2) {
            var col1H = cols[0].scrollHeight;
            var col2H = cols[1].scrollHeight;
            var maxColH = Math.max(col1H, col2H);
            cloneHeight = Math.max(cloneHeight, maxColH + 48);
        }
        var cloneWidth = printElements.width;

        html2canvas(printElements.clone, { scale: 2, useCORS: true, logging: false, width: cloneWidth, height: cloneHeight, scrollX: 0, scrollY: 0 })
        .then(function(canvas) {
            cleanupPrintClone(printElements);

            // Crop bottom 2 CSS px (4 canvas px at scale 2)
            var SCALE = 2;
            var srcH = Math.max(1, canvas.height - 2 * SCALE);
            var srcW = canvas.width;

            // Buffer in canvas pixels for the shadow halo
            var BUFFER = 25 * SCALE; // 25 CSS px
            var SHADOW_BLUR = 10 * SCALE; // 10 CSS px

            var output = document.createElement('canvas');
            output.width = srcW + 2 * BUFFER;
            output.height = srcH + 2 * BUFFER;
            var ctx = output.getContext('2d', { alpha: false });

            // Page-color background (no alpha)
            ctx.fillStyle = '#f4f4f4';
            ctx.fillRect(0, 0, output.width, output.height);

            // Paint the captured statblock with a soft shadow
            ctx.shadowColor = 'rgba(0,0,0,0.24)';
            ctx.shadowBlur = SHADOW_BLUR;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.drawImage(canvas, 0, 0, srcW, srcH, BUFFER, BUFFER, srcW, srcH);

            // Erase shadow on the top and bottom strips (keep only left/right shadow)
            ctx.shadowColor = 'transparent';
            ctx.fillStyle = '#f4f4f4';
            ctx.fillRect(0, 0, output.width, BUFFER);
            ctx.fillRect(0, BUFFER + srcH, output.width, output.height - (BUFFER + srcH));

            var link = document.createElement('a');
            link.download = filename;
            link.href = output.toDataURL('image/png');
            link.click();
        }).catch(function(error) {
            console.error("PNG with shadow generation error:", error);
            cleanupPrintClone(printElements);
            showAlert("Error generating PNG. Please try again.");
        });
    }, 300); });
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

    // Telegraphed Actions (conditional). At most one per creature: a short overview line, then Tell / Strikes / Avoid as separate blocks.
    addSection('telegraphedActions', 'Telegraphed Actions', monster.telegraphedActions, function(t, idx) {
        var h = '<div class="telegraph-action" data-section="telegraphedActions" data-index="' + idx + '">';
        h += '<div class="telegraph-overview"><span class="telegraph-action-name">' + t.name + '.</span>' + (t.overview ? ' ' + t.overview : '') + '</div>';
        if (t.tell) h += '<div class="telegraph-beat"><span class="telegraph-label">Tell.</span> ' + t.tell + '</div>';
        if (t.effect) h += '<div class="telegraph-beat"><span class="telegraph-label">Strikes.</span> ' + t.effect + '</div>';
        if (t.counter) h += '<div class="telegraph-beat"><span class="telegraph-label">Avoid.</span> ' + t.counter + '</div>';
        return h + '</div>';
    });
    
    // User-selected single-column mode: skip measurement & splitting, render one long column
    if (columnMode === 'single') {
        var singleHtml = '<div class="stat-block single-column">';
        for (var i = 0; i < items.length; i++) singleHtml += items[i].html;
        singleHtml += '</div>';
        container.innerHTML = singleHtml;
        renderTabs();
        return;
    }

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
    html += '<div class="stat-col-divider"></div>';
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
    if (sharedView) {
        buttonsHtml += buildSettingsButtonHtml();
        buttonsHtml += '<button class="print-btn" onclick="printStatBlock()">PDF</button>';
        buttonsHtml += '<button class="print-btn" onclick="printPNG()">PNG</button>';
        buttonsHtml += '<button class="print-btn" onclick="printPNGWithShadow()">PNG with shadow</button>';
    } else {
        buttonsHtml += buildSettingsButtonHtml();
        var et = (currentMonster && currentMonster.entityType) || 'Monster';
        buttonsHtml += '<select class="entity-type-select" onchange="setEntityType(this.value)" title="Entity type">';
        buttonsHtml += '<option value="Monster"' + (et === 'Monster' ? ' selected' : '') + '>Monster</option>';
        buttonsHtml += '<option value="NPC"' + (et === 'NPC' ? ' selected' : '') + '>NPC</option>';
        buttonsHtml += '</select>';
        buttonsHtml += '<label for="restore-upload" class="restore-btn">Overwrite</label>';
        buttonsHtml += '<input type="file" id="restore-upload" accept=".json" style="display:none" />';
        buttonsHtml += '<button class="export-btn" onclick="exportJSON()">Export</button>';
        buttonsHtml += '<button class="print-btn" onclick="printStatBlock()">PDF</button>';
        buttonsHtml += '<button class="print-btn" onclick="printPNG()">PNG</button>';
        buttonsHtml += '<button class="print-btn" onclick="printPNGWithShadow()">PNG with shadow</button>';
        buttonsHtml += '<button class="edit-btn" onclick="toggleEdit()" title="Edit statblock">&#9998;</button>';
        buttonsHtml += '<button class="share-btn" onclick="shareMonster()" title="Get shareable link">Share</button>';
        buttonsHtml += '<button class="delete-current-btn" onclick="deleteCurrentMonster()" title="Delete this monster">Delete</button>';
    }
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

// ============ SETTINGS PANEL ============
function buildSettingsButtonHtml() {
    var gearSvg = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/><circle cx="12" cy="12" r="3.6" fill="white"/></svg>';
    return '<button class="settings-btn" onclick="openSettingsModal()" title="Settings" aria-label="Settings">' + gearSvg + '</button>';
}

function openSettingsModal() {
    if (document.getElementById('settings-modal')) return;

    var overlay = document.createElement('div');
    overlay.id = 'settings-modal';
    overlay.className = 'settings-modal-overlay';

    var box = document.createElement('div');
    box.className = 'settings-modal-box';
    box.innerHTML =
        '<h3 class="settings-modal-title">Settings</h3>' +
        '<label class="settings-row"><span># of Columns:</span>' +
        '<select id="settings-columns-select">' +
        '<option value="double"' + (columnMode === 'double' ? ' selected' : '') + '>Double</option>' +
        '<option value="single"' + (columnMode === 'single' ? ' selected' : '') + '>Single</option>' +
        '</select>' +
        '</label>' +
        '<label class="settings-row"><span>Theme:</span>' +
        '<select id="settings-theme-select">' +
        '<option value="green"' + (theme === 'green' ? ' selected' : '') + '>Green</option>' +
        '<option value="crimson"' + (theme === 'crimson' ? ' selected' : '') + '>Crimson</option>' +
        '<option value="raspberry"' + (theme === 'raspberry' ? ' selected' : '') + '>Raspberry</option>' +
        '<option value="mulberry"' + (theme === 'mulberry' ? ' selected' : '') + '>Mulberry</option>' +
        '<option value="burgundy"' + (theme === 'burgundy' ? ' selected' : '') + '>Burgundy</option>' +
        '<option value="wine"' + (theme === 'wine' ? ' selected' : '') + '>Wine</option>' +
        '</select>' +
        '</label>' +
        '<div class="modal-btn-row">' +
        '<button class="modal-btn modal-btn-confirm" id="settings-confirm-btn">Confirm</button>' +
        '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    document.getElementById('settings-confirm-btn').addEventListener('click', confirmSettingsModal);
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeSettingsModal();
    });
}

function confirmSettingsModal() {
    var colSelect = document.getElementById('settings-columns-select');
    var newMode = colSelect ? colSelect.value : columnMode;
    var themeSelect = document.getElementById('settings-theme-select');
    var newTheme = themeSelect ? themeSelect.value : theme;
    closeSettingsModal();
    if (newTheme !== theme) {
        setTheme(newTheme);
    }
    if (newMode !== columnMode) {
        setColumnMode(newMode);
    }
}

function setTheme(newTheme) {
    theme = newTheme;
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
}

function closeSettingsModal() {
    var overlay = document.getElementById('settings-modal');
    if (!overlay) return;
    overlay.parentNode.removeChild(overlay);
    document.body.classList.remove('modal-open');
}

function setColumnMode(mode) {
    columnMode = mode;
    localStorage.setItem('columnMode', mode);
    if (currentMonster) {
        renderStatBlock(currentMonster);
    }
}

function setEntityType(newType) {
    if (!currentMonster) return;
    currentMonster.entityType = newType;
    // Persist to Supabase if signed in and have a doc id
    if (currentUser && currentMonsterDocId) {
        var saveData = Object.assign({}, currentMonster);
        delete saveData.groupId;
        sb.from('monsters').update({ data: saveData }).eq('id', currentMonsterDocId)
            .then(function(result) {
                if (result.error) showAlert("Error saving type: " + result.error.message);
            });
    }
    // Re-render so summary section visibility updates
    renderStatBlock(currentMonster);
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
    var summaryName = summary.name || (currentMonster ? currentMonster.name : 'Creature');
    
    // Check if we're in mobile/single-column mode
    var isMobile = window.innerWidth <= 768;
    
    // Build each section as a discrete block
    var sections = [];
    
    // Description
    if (summary.description) {
        sections.push('<div class="lore-section"><div class="lore-description">' + summary.description + '</div></div>');
    }

    // Physical Description (boxed read-aloud style)
    if (summary.physicalDescription) {
        sections.push('<div class="lore-section"><h2 class="lore-section-header">Physical Description</h2><div class="lore-boxed">' + summary.physicalDescription + '</div></div>');
    }

    // Personality (NPC only). Accepts string OR { text, groups: [{ name, items }] }
    var entityType = (currentMonster && currentMonster.entityType) || 'Monster';
    var isNPC = entityType === 'NPC';

    if (isNPC && summary.personality) {
        var p = summary.personality;
        var s = '<div class="lore-section"><h2 class="lore-section-header">Personality</h2><div class="lore-personality">';
        if (typeof p === 'string') {
            s += p;
        } else {
            if (p.text) s += '<p>' + p.text + '</p>';
            if (p.groups && p.groups.length > 0) {
                for (var i = 0; i < p.groups.length; i++) {
                    var g = p.groups[i];
                    s += '<div class="lore-personality-group">';
                    if (g.name) s += '<h3 class="lore-subheader">' + g.name + '</h3>';
                    if (g.items && g.items.length > 0) {
                        s += '<ul class="lore-personality-list">';
                        for (var j = 0; j < g.items.length; j++) {
                            s += '<li>' + g.items[j] + '</li>';
                        }
                        s += '</ul>';
                    }
                    s += '</div>';
                }
            }
        }
        s += '</div></div>';
        sections.push(s);
    }

    // Tactics — array of phases: [{ name, items: [string, ...] }]
    if (summary.tactics && summary.tactics.length > 0) {
        var s = '<div class="lore-section"><h2 class="lore-section-header">Tactics</h2>';
        for (var i = 0; i < summary.tactics.length; i++) {
            var phase = summary.tactics[i];
            s += '<div class="lore-tactics-phase">';
            if (phase.name) s += '<h3 class="lore-subheader">' + phase.name + '</h3>';
            if (phase.items && phase.items.length > 0) {
                s += '<ul class="lore-tactics-list">';
                for (var j = 0; j < phase.items.length; j++) {
                    s += '<li>' + phase.items[j] + '</li>';
                }
                s += '</ul>';
            }
            s += '</div>';
        }
        s += '</div>';
        sections.push(s);
    }

    // Legends and Lore
    if (summary.legendsAndLore && summary.legendsAndLore.length > 0) {
        var s = '<div class="lore-section"><h2 class="lore-section-header">Legends and Lore</h2>';
        var loreIntro = summary.legendsAndLoreIntro || 'With a History or Nature check, characters can learn the following:';
        s += '<p class="lore-intro">' + loreIntro + '</p>';
        for (var i = 0; i < summary.legendsAndLore.length; i++) {
            s += '<div class="lore-dc-entry"><strong>DC ' + summary.legendsAndLore[i].dc + '</strong> ' + summary.legendsAndLore[i].text + '</div>';
        }
        s += '</div>';
        sections.push(s);
    }
    
    // Encounters
    if (summary.encounters) {
        var s = '<div class="lore-section"><h2 class="lore-section-header">' + summaryName + ' Encounters</h2>';
        if (summary.encounters.description) {
            s += '<p class="lore-encounters-desc">' + summary.encounters.description + '</p>';
        }
        if (summary.encounters.groups && summary.encounters.groups.length > 0) {
            for (var i = 0; i < summary.encounters.groups.length; i++) {
                var enc = summary.encounters.groups[i];
                s += '<div class="lore-encounter-group">';
                s += '<div class="lore-encounter-cr"><strong>' + enc.cr + '</strong> ' + enc.creatures + '</div>';
                if (enc.treasure) {
                    s += '<div class="lore-encounter-treasure"><strong>Treasure</strong> ' + enc.treasure + '</div>';
                }
                s += '</div>';
            }
        }
        s += '</div>';
        sections.push(s);
    }
    
    // Signs
    if (summary.signs && summary.signs.length > 0) {
        var s = '<div class="lore-section"><h2 class="lore-section-header">Signs</h2>';
        s += '<table class="lore-table"><tbody>';
        for (var i = 0; i < summary.signs.length; i++) {
            s += '<tr><td class="lore-table-roll">' + summary.signs[i].roll + '</td><td>' + summary.signs[i].text + '</td></tr>';
        }
        s += '</tbody></table></div>';
        sections.push(s);
    }
    
    // Behavior
    if (summary.behavior && summary.behavior.length > 0) {
        var s = '<div class="lore-section"><h2 class="lore-section-header">Behavior</h2>';
        s += '<table class="lore-table"><tbody>';
        for (var i = 0; i < summary.behavior.length; i++) {
            s += '<tr><td class="lore-table-roll">' + summary.behavior[i].roll + '</td><td>' + summary.behavior[i].text + '</td></tr>';
        }
        s += '</tbody></table></div>';
        sections.push(s);
    }

    // Quotes — array of categories: [{ category, die, lines: [string, ...] }]. Any creature that can vocalize (the skill omits it for mindless beasts).
    if (summary.quotes && summary.quotes.length > 0) {
        var s = '<div class="lore-section"><h2 class="lore-section-header">Quotes</h2>';
        for (var i = 0; i < summary.quotes.length; i++) {
            var cat = summary.quotes[i];
            s += '<div class="lore-quotes-category">';
            if (cat.category) s += '<h3 class="lore-subheader">' + cat.category + '</h3>';
            if (cat.lines && cat.lines.length > 0) {
                var dieLabel = cat.die || ('d' + cat.lines.length);
                s += '<table class="lore-table lore-quotes-table"><thead><tr><th>' + dieLabel + '</th><th>Line</th></tr></thead><tbody>';
                for (var j = 0; j < cat.lines.length; j++) {
                    s += '<tr><td class="lore-table-roll">' + (j + 1) + '</td><td>' + cat.lines[j] + '</td></tr>';
                }
                s += '</tbody></table>';
            }
            s += '</div>';
        }
        s += '</div>';
        sections.push(s);
    }

    // Loot
    if (summary.loot) {
        var s = '<div class="lore-section"><h2 class="lore-section-header">' + (summary.loot.title || 'Weapons, Armor & Items') + '</h2>';
        if (summary.loot.description) {
            s += '<p class="lore-loot-desc">' + summary.loot.description + '</p>';
        }
        if (summary.loot.table && summary.loot.table.length > 0) {
            s += '<table class="lore-table lore-loot-table">';
            s += '<thead><tr><th>' + (summary.loot.dieType || 'd12') + '</th><th>Item(s)</th></tr></thead>';
            s += '<tbody>';
            for (var i = 0; i < summary.loot.table.length; i++) {
                s += '<tr><td class="lore-table-roll">' + summary.loot.table[i].roll + '</td><td>' + summary.loot.table[i].text + '</td></tr>';
            }
            s += '</tbody></table>';
        }
        s += '</div>';
        sections.push(s);
    }
    
    // Names (after loot)
    if (summary.names) {
        sections.push('<div class="lore-section"><h2 class="lore-section-header">Names</h2><p class="lore-names">' + summary.names + '</p></div>');
    }
    
    // Image
    if (summary.image) {
        sections.push('<div class="lore-section"><div class="lore-image-frame"><img src="' + summary.image + '" alt="' + summaryName + '" class="lore-image" /></div></div>');
    }
    
    // Mobile: single column
    if (isMobile) {
        var html = '<div class="lore-block">';
        html += '<h1 class="lore-title">' + summaryName + '</h1>';
        for (var i = 0; i < sections.length; i++) html += sections[i];
        html += '</div>';
        return html;
    }

    // Desktop: JS-driven two-column layout (same approach as statblock)
    var PAGE_CONTENT_HEIGHT = 980;
    var TITLE_HEIGHT = 50;
    var COL_WIDTH = 380;

    // Measure each section at column width
    var measurer = document.createElement('div');
    measurer.className = 'lore-block';
    measurer.style.cssText = 'position:absolute;visibility:hidden;width:' + COL_WIDTH + 'px;padding:0;margin:0;border:none;box-shadow:none;';
    document.body.appendChild(measurer);

    var heights = [];
    for (var i = 0; i < sections.length; i++) {
        measurer.innerHTML = sections[i];
        heights.push(measurer.offsetHeight);
    }
    document.body.removeChild(measurer);

    // Paginate: group sections into pages based on measured heights
    var pages = [];
    var pageStart = 0;

    while (pageStart < sections.length) {
        var isFirstPage = (pages.length === 0);
        var availH = PAGE_CONTENT_HEIGHT - (isFirstPage ? TITLE_HEIGHT : 0);
        var pageEnd = pageStart;
        var totalH = 0;

        while (pageEnd < sections.length) {
            totalH += heights[pageEnd];
            // Content fills two columns, so page overflows when totalH/2 > availH
            if (totalH > availH * 2 && pageEnd > pageStart) {
                totalH -= heights[pageEnd];
                break;
            }
            pageEnd++;
        }
        if (pageEnd === pageStart) pageEnd = pageStart + 1;

        pages.push({ start: pageStart, end: pageEnd, isFirst: isFirstPage });
        pageStart = pageEnd;
    }

    // Build HTML for each page
    var html = '';
    for (var p = 0; p < pages.length; p++) {
        var page = pages[p];
        var isLast = (p === pages.length - 1);
        var pageSections = sections.slice(page.start, page.end);
        var pageHeights = heights.slice(page.start, page.end);

        html += '<div class="lore-block lore-page' + (isLast ? ' lore-page-last' : '') + '">';
        // Page-spanning vertical divider (matches statblock — top:20 to bottom:20 of the page box)
        html += '<div class="lore-col-divider"></div>';

        // Find best split point: col1 >= col2, most balanced
        var bestSplit = -1;
        var bestScore = Infinity;
        var totalPageH = 0;
        for (var i = 0; i < pageHeights.length; i++) totalPageH += pageHeights[i];

        for (var split = 1; split < pageSections.length; split++) {
            var col1H = 0;
            var col2H = 0;
            for (var j = 0; j < split; j++) col1H += pageHeights[j];
            for (var j = split; j < pageSections.length; j++) col2H += pageHeights[j];

            // Col2 must never be longer than col1
            if (col2H > col1H * 1.05) continue;

            // Score: prefer balanced, penalize col2 > col1 heavily
            var imbalance;
            if (col2H > col1H) {
                imbalance = (col2H - col1H) * 2;
            } else {
                imbalance = col1H - col2H;
            }
            if (imbalance < bestScore) {
                bestScore = imbalance;
                bestSplit = split;
            }
        }

        // If strict col1>=col2 found no split, fall back to most balanced split
        if (bestSplit === -1 && pageSections.length >= 2) {
            for (var split = 1; split < pageSections.length; split++) {
                var col1H = 0;
                var col2H = 0;
                for (var j = 0; j < split; j++) col1H += pageHeights[j];
                for (var j = split; j < pageSections.length; j++) col2H += pageHeights[j];
                var imbalance = Math.abs(col1H - col2H);
                if (imbalance < bestScore) {
                    bestScore = imbalance;
                    bestSplit = split;
                }
            }
        }

        if (bestSplit === -1) {
            // Only 1 section — use CSS columns to flow content across 2 columns
            var flowH = PAGE_CONTENT_HEIGHT - (page.isFirst ? TITLE_HEIGHT : 0);
            html += '<div class="lore-columns-flow" style="height:' + flowH + 'px;">';
            if (page.isFirst) {
                html += '<h1 class="lore-title">' + summaryName + '</h1>';
            }
            for (var i = 0; i < pageSections.length; i++) html += pageSections[i];
            html += '</div>';
        } else {
            html += '<div class="lore-columns">';
            html += '<div class="lore-col lore-col-1">';
            if (page.isFirst) {
                html += '<h1 class="lore-title">' + summaryName + '</h1>';
            }
            for (var i = 0; i < bestSplit; i++) html += pageSections[i];
            html += '</div>';
            html += '<div class="lore-col lore-col-2">';
            for (var i = bestSplit; i < pageSections.length; i++) html += pageSections[i];
            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
    }

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
                var preservedGroupId = currentMonster.groupId || null;
                var uploadData = Object.assign({}, monsterData);
                delete uploadData.groupId;

                sb.from('monsters').update({
                    name: monsterData.name,
                    monster_id: monsterData.monsterId || null,
                    group_id: preservedGroupId,
                    data: uploadData
                }).eq('id', currentMonsterDocId)
                    .then(function(result) {
                        if (result.error) throw result.error;
                        monsterData.groupId = preservedGroupId;
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
            "legendsAndLoreIntro": "",
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
        "11. The optional field \"legendsAndLoreIntro\" inside summary allows a custom intro",
        "    line for the Legends and Lore section (e.g., \"With a History check, characters",
        "    can learn:\"). If omitted or empty, it defaults to \"With a History or Nature",
        "    check, characters can learn the following:\"",
        "",
        "12. Output ONLY valid JSON. No comments, no markdown, no explanation.",
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
    
    // Multiple monsters — save all to database
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
    
    // Check if this monsterId already exists
    sb.from('monsters').select('id, group_id').eq('monster_id', monster.monsterId)
        .then(function(result) {
            if (result.error) throw result.error;
            if (result.data && result.data.length > 0) {
                // Duplicate found — ask user
                var existing = result.data[0];
                showConfirm('"' + monster.name + '" already exists. Replace it?',
                    function() {
                        // Replace
                        var uploadData = Object.assign({}, monster);
                        delete uploadData.groupId;
                        sb.from('monsters').update({
                            name: monster.name,
                            monster_id: monster.monsterId,
                            group_id: existing.group_id,
                            data: uploadData
                        }).eq('id', existing.id)
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
                var uploadData = Object.assign({}, monster);
                delete uploadData.groupId;
                sb.from('monsters').insert({
                    user_id: currentUser.id,
                    group_id: null,
                    monster_id: monster.monsterId,
                    name: monster.name,
                    data: uploadData
                })
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
    sb.from('monsters').select('id, group_id').eq('monster_id', monster.monsterId)
        .then(function(result) {
            if (result.error) throw result.error;
            if (result.data && result.data.length > 0) {
                // Update existing
                var existing = result.data[0];
                monster.groupId = existing.group_id;
                var uploadData = Object.assign({}, monster);
                delete uploadData.groupId;
                sb.from('monsters').update({
                    name: monster.name,
                    monster_id: monster.monsterId,
                    data: uploadData
                }).eq('id', existing.id)
                    .then(function(updateResult) {
                        if (updateResult.error) throw updateResult.error;
                        currentMonsterDocId = existing.id;
                        localStorage.setItem('lastMonsterDocId', existing.id);
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
