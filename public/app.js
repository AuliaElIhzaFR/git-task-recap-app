document.addEventListener('DOMContentLoaded', () => {
    // Determine which page we are on
    const isLogin = window.location.pathname === '/login';
    const isDashboard = window.location.pathname === '/dashboard';
    const isHistory = window.location.pathname === '/history';

    // Global State
    let currentUser = null;
    let localPAT = localStorage.getItem('gitea_pat');
    let userProjects = [];
    let currentCommits = [];
    let isFetchCancelled = false;

    // Check Authentication state
    async function checkAuth() {
        if (!localPAT) {
            handleUnauthenticated();
            return;
        }

        try {
            const res = await fetch('/api/verify', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${localPAT}` }
            });

            if (res.ok) {
                currentUser = await res.json();
                handleAuthenticated();
            } else {
                handleUnauthenticated();
            }
        } catch (err) {
            console.error('Auth verification failed', err);
            handleUnauthenticated();
        }
    }

    // Routing Logic based on Auth State
    function handleAuthenticated() {
        if (isLogin) {
            window.location.href = '/dashboard';
        } else if (isDashboard) {
            initDashboard();
        } else if (isHistory) {
            initHistoryPage();
        }
    }

    function handleUnauthenticated() {
        localStorage.removeItem('gitea_pat');
        localPAT = null;
        currentUser = null;

        if (isDashboard || isHistory) {
            window.location.href = '/login';
        }
    }

    // Shared header setup (used on dashboard & history pages)
    function initUserHeader() {
        const welcomeText = document.getElementById('welcomeText');
        const userAvatar = document.getElementById('userAvatar');
        const avatarInitial = document.getElementById('avatarInitial');
        const logoutBtn = document.getElementById('logoutBtn');
        const userMenuBtn = document.getElementById('userMenuBtn');
        const userDropdownMenu = document.getElementById('userDropdownMenu');

        welcomeText.textContent = currentUser.full_name || currentUser.name || currentUser.login || 'User';
        if (currentUser.avatar_url) {
            userAvatar.src = currentUser.avatar_url;
            userAvatar.classList.remove('hidden-view');
        } else if (avatarInitial) {
            const name = currentUser.full_name || currentUser.login || '?';
            avatarInitial.textContent = name.charAt(0).toUpperCase();
            avatarInitial.classList.remove('hidden-view');
        }

        // Dropdown toggle
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdownMenu.classList.toggle('hidden-view');
        });
        document.addEventListener('click', () => userDropdownMenu.classList.add('hidden-view'));
        userDropdownMenu.addEventListener('click', (e) => e.stopPropagation());

        // Logout
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('gitea_pat');
            window.location.href = '/login';
        });
    }

    // --- DASHBOARD LOGIC ---
    async function initDashboard() {
        const welcomeText = document.getElementById('welcomeText');
        const userAvatar = document.getElementById('userAvatar');
        const logoutBtn = document.getElementById('logoutBtn');
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        const fetchTasksBtn = document.getElementById('fetchTasksBtn');
        const stopFetchBtn = document.getElementById('stopFetchBtn');
        const cleanWithAiBtn = document.getElementById('cleanWithAiBtn');
        const exportExcelBtn = document.getElementById('exportExcelBtn');
        const filterMergeCheckbox = document.getElementById('filterMergeCheckbox');

        initUserHeader();
        initMultiAccount();

        // Dates
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        endDateInput.value = today.toISOString().split('T')[0];
        startDateInput.value = firstDay.toISOString().split('T')[0];

        // Stop button
        stopFetchBtn.addEventListener('click', () => {
            isFetchCancelled = true;
        });

        // Force-refresh repos (bypass cache)
        document.getElementById('refreshReposBtn')?.addEventListener('click', () => {
            fetchProjects(true);
        });

        // Filter merge checkbox - re-render when toggled
        filterMergeCheckbox.addEventListener('change', () => {
            if (currentCommits.length > 0) renderTasks(currentCommits, false);
        });

        // Pre-populate repo checkboxes instantly from cache (if available)
        try {
            const CACHE_KEY = `gitea_projects_${currentUser.login}`;
            const CACHE_TTL = 30 * 60 * 1000;
            const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            if (cached && (Date.now() - cached.ts) < CACHE_TTL && cached.data.length > 0) {
                userProjects = cached.data;
                const sidebar = document.getElementById('projectsSidebar');
                const countSpan = document.getElementById('sidebarRepoCount');
                const loader = document.getElementById('projectsLoader');
                renderSidebar(userProjects, sidebar, countSpan, loader);
            }
        } catch (_) {}

        // Fetch Orgs/Projects (uses cache if valid, otherwise fetches from API)
        await fetchProjects();



        // Fetch Tasks (Live Streaming)
        fetchTasksBtn.addEventListener('click', async () => {
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;

            if (!startDate || !endDate) {
                alert("Please select both start and end dates.");
                return;
            }

            if (userProjects.length === 0) {
               alert("No projects loaded yet. Please wait.");
               return;
            }

            showLoader(true, fetchTasksBtn, 'Fetching...');
            stopFetchBtn.classList.remove('hidden-view');
            fetchTasksBtn.classList.add('hidden-view');
            const resultsSection = document.getElementById('resultsSection');
            const noTasksMsg = document.getElementById('noTasksMsg');
            const pBarContainer = document.getElementById('fetchProgressContainer');
            const pBar = document.getElementById('fetchProgressBar');
            
            resultsSection.classList.remove('hidden-view');
            noTasksMsg.classList.remove('hidden-view');
            noTasksMsg.textContent = "Fetching commits... Tasks will appear here live.";
            exportExcelBtn.disabled = true;
            
            pBarContainer.classList.remove('hidden-view');
            pBar.style.width = '0%';
            
            currentCommits = [];
            isFetchCancelled = false;
            renderTasks([], true); // initial clear

            // Determine which repos to fetch from (multi-select checkboxes)
            const checkedRepos = new Set(
                [...document.querySelectorAll('.repo-checkbox:checked')].map(cb => cb.value)
            );
            const projectsToFetch = checkedRepos.size > 0
                ? userProjects.filter(p => checkedRepos.has(`${p.owner.login}/${p.name}`))
                : userProjects;



            try {
                // Collect usernames to search for (comma-separated, plus logged-in user)
                const usernameInput = document.getElementById('targetUsername')?.value.trim() || '';
                const extraNames = usernameInput
                    ? usernameInput.split(',').map(s => s.trim()).filter(Boolean)
                    : [];
                // Always include the logged-in user
                const loggedInName = currentUser.login || currentUser.full_name || currentUser.name;
                // Build unique list: put logged-in user first, then extras
                const searchNames = [...new Set([loggedInName, ...extraNames])];

                // Track progress
                let completed = 0;
                const total = projectsToFetch.length;

                // Fire them all concurrently but handle resolutions individually
                const fetchPromises = projectsToFetch.map(async (project) => {
                    try {
                        // Optional visual cue in sidebar
                        const sidebarItem = document.getElementById(`repo-item-${project.id}`);
                        if (sidebarItem) sidebarItem.classList.add('bg-indigo-50');

                        // One request per username, run in parallel for this repo
                        const perUserResults = await Promise.all(
                            searchNames.map(name =>
                                fetch('/api/commits', {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${localPAT}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        owner: project.owner.login,
                                        repoName: project.name,
                                        authorName: name,
                                        authorEmail: currentUser.email,
                                        since: startDate,
                                        until: endDate
                                    })
                                }).then(r => r.ok ? r.json() : [])
                                  .catch(() => [])
                            )
                        );

                        // Flatten and deduplicate by commit SHA
                        const seenShas = new Set();
                        const mergedCommits = perUserResults
                            .flat()
                            .filter(c => {
                                if (seenShas.has(c.sha)) return false;
                                seenShas.add(c.sha);
                                return true;
                            })
                            .map(c => ({ ...c, projectName: project.name }));

                        if (mergedCommits.length > 0 && !isFetchCancelled) {
                            currentCommits = [...currentCommits, ...mergedCommits];
                            currentCommits.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                            renderTasks(currentCommits, false);
                        }
                    } catch (err) {
                        console.error(`Failed on ${project.name}`, err);
                    } finally {
                        completed++;
                        pBar.style.width = `${(completed / total) * 100}%`;
                        
                        // Visual cue finish
                        const sidebarItem = document.getElementById(`repo-item-${project.id}`);
                        if (sidebarItem) {
                            sidebarItem.classList.remove('bg-indigo-50');
                            const icon = sidebarItem.querySelector('.status-icon');
                            if(icon) icon.innerHTML = `<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
                        }
                    }
                });

                await Promise.all(fetchPromises);
                
                // Finalize
                if (currentCommits.length === 0) {
                    noTasksMsg.classList.remove('hidden-view');
                    noTasksMsg.textContent = "No tasks found in the selected date range.";
                } else {
                    noTasksMsg.classList.add('hidden-view');
                    exportExcelBtn.disabled = false;
                    cleanWithAiBtn.disabled = false;
                    document.getElementById('aiCleanedBadge').classList.add('hidden-view');
                }

            } catch (err) {
                 console.error('Error fetching tasks', err);
                 alert('An error occurred while fetching tasks');
            } finally {
                showLoader(false, fetchTasksBtn, 'Fetch Tasks');
                fetchTasksBtn.classList.remove('hidden-view');
                stopFetchBtn.classList.add('hidden-view');
                isFetchCancelled = false;
                
                // Reset sidebar icons after 3 seconds
                setTimeout(() => {
                    pBarContainer.classList.add('hidden-view');
                    document.querySelectorAll('.status-icon').forEach(el => {
                        el.innerHTML = `<span class="w-2 h-2 rounded-full bg-gray-300"></span>`;
                    });
                }, 3000);
            }
        });

        // Export Functionality
        exportExcelBtn.addEventListener('click', async () => {
             if (currentCommits.length === 0) return;
             
             showLoader(true, exportExcelBtn, 'Exporting...');
             
             try {
                 const res = await fetch('/api/export', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                         commits: currentCommits,
                         user: currentUser.full_name || currentUser.name || currentUser.login,
                         startDate: startDateInput.value,
                         endDate: endDateInput.value
                     })
                 });
     
                if (res.ok) {
                     const blob = await res.blob();
                     const url = window.URL.createObjectURL(blob);
                     const a = document.createElement('a');
                     a.href = url;
                     // The filename comes from the Content-Disposition header via blob download
                     a.download = `Task_Recap_${startDateInput.value}_${endDateInput.value}.xlsx`;
                     document.body.appendChild(a);
                     a.click();
                     a.remove();
                     window.URL.revokeObjectURL(url);
                     // History is on its own page — no inline refresh needed
                 } else {
                     alert('Failed to export. Please try again.');
                 }
             } catch (err) {
                 console.error('Export error', err);
                 alert('An error occurred while exporting tasks');
             } finally {
                 showLoader(false, exportExcelBtn, 'Export Excel');
             }
         });
        // Clean with AI Functionality
        cleanWithAiBtn.addEventListener('click', async () => {
            if (currentCommits.length === 0) return;

            showLoader(true, cleanWithAiBtn, '✨ Enhancing...');

            try {
                const res = await fetch('/api/clean-commits', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localPAT}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ commits: currentCommits })
                });

                if (res.ok) {
                    currentCommits = await res.json();
                    renderTasks(currentCommits, false);
                    document.getElementById('aiCleanedBadge').classList.remove('hidden-view');
                } else {
                    const errData = await res.json();
                    alert(`AI Error: ${errData.error || 'Failed to clean commits'}`);
                }
            } catch (err) {
                console.error('AI clean error', err);
                alert('An error occurred while processing with AI');
            } finally {
                showLoader(false, cleanWithAiBtn, '✨ Enhance with AI');
            }
        });

        // Modal Logic (wired once)
        let editingIndex = -1;
        const editModal = document.getElementById('editModal');
        const editTitleInput = document.getElementById('editTitle');
        const editMessageInput = document.getElementById('editMessage');
        const editProjectNameInput = document.getElementById('editProjectName');

        document.getElementById('editModalCancel').addEventListener('click', () => {
            editModal.classList.add('hidden-view');
            editingIndex = -1;
        });

        document.getElementById('editModalSave').addEventListener('click', () => {
            if (editingIndex < 0) return;
            currentCommits[editingIndex].title = editTitleInput.value.trim();
            currentCommits[editingIndex].message = editMessageInput.value.trim();
            currentCommits[editingIndex].projectName = editProjectNameInput.value.trim();
            editModal.classList.add('hidden-view');
            editingIndex = -1;
            renderTasks(currentCommits, false);
        });

        // Close modal on backdrop click
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) {
                editModal.classList.add('hidden-view');
                editingIndex = -1;
            }
        });

        // Expose helpers to window so inline onclick can access them
        window._openEditModal = (index) => {
            editingIndex = index;
            const commit = currentCommits[index];
            editTitleInput.value = commit.title || commit.message.split('\n')[0];
            editMessageInput.value = commit.message || '';
            editProjectNameInput.value = commit.projectName || '';
            editModal.classList.remove('hidden-view');
            editTitleInput.focus();
            editTitleInput.select();
        };

        window._deleteRow = (index) => {
            currentCommits.splice(index, 1);
            renderTasks(currentCommits, false);
            if (currentCommits.length === 0) {
                exportExcelBtn.disabled = true;
                cleanWithAiBtn.disabled = true;
            }
        };

    }

    async function fetchProjects(forceRefresh = false) {
        const loader = document.getElementById('projectsLoader');
        const sidebar = document.getElementById('projectsSidebar');
        const countSpan = document.getElementById('sidebarRepoCount');
        const CACHE_KEY = `gitea_projects_${currentUser.login}`;
        const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

        // Try cache first (unless forced refresh)
        if (!forceRefresh) {
            try {
                const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
                if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
                    userProjects = cached.data;
                    renderSidebar(userProjects, sidebar, countSpan, loader);
                    return;
                }
            } catch (_) {}
        }

        // Loader is already visible, show it
        loader.classList.remove('hidden-view');
        // Clear stale sidebar content before re-render
        Array.from(sidebar.children).forEach(c => { if (c !== loader) c.remove(); });

        try {
            const res = await fetch('/api/projects', {
                headers: { 'Authorization': `Bearer ${localPAT}` }
            });
            if (res.ok) {
                userProjects = await res.json();
                // Save to cache
                localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: userProjects }));
                renderSidebar(userProjects, sidebar, countSpan, loader);
            }
        } catch (err) {
            console.error('Failed to fetch projects', err);
            loader.innerHTML = '<span class="text-red-500 text-xs">Failed to load</span>';
        }
    }

    function renderSidebar(projects, sidebar, countSpan, loader) {
        countSpan.textContent = projects.length;
        const orgMap = {};
        projects.forEach(p => {
            const owner = p.owner.login;
            if (!orgMap[owner]) orgMap[owner] = [];
            orgMap[owner].push(p);
        });

        loader.classList.add('hidden-view');
        // Clear any old content (keep loader node)
        Array.from(sidebar.children).forEach(c => { if (c !== loader) c.remove(); });

        for (const org in orgMap) {
            const orgHeader = document.createElement('div');
            orgHeader.className = 'font-semibold text-gray-700 mt-3 mb-1 uppercase text-xs tracking-wider px-1';
            orgHeader.textContent = org;
            sidebar.appendChild(orgHeader);

            orgMap[org].forEach(repo => {
                const row = document.createElement('div');
                row.id = `repo-item-${repo.id}`;
                row.className = 'flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors';
                row.innerHTML = `
                    <span class="truncate text-xs cursor-default" title="${repo.name}">${repo.name}</span>
                    <div class="status-icon flex-shrink-0 ml-2">
                        <span class="w-2 h-2 rounded-full bg-gray-300 inline-block"></span>
                    </div>
                `;
                sidebar.appendChild(row);
            });
        }

        // Populate repo filter checkboxes
        const repoBtn = document.getElementById('repoFilterBtn');
        const repoPanel = document.getElementById('repoFilterPanel');
        const repoLabel = document.getElementById('repoFilterLabel');
        const checkboxList = document.getElementById('repoCheckboxList');
        const selectAllBtn = document.getElementById('repoSelectAll');
        const deselectAllBtn = document.getElementById('repoDeselectAll');

        if (!repoBtn || !checkboxList) return;

        // Build checkbox list
        checkboxList.innerHTML = '';
        for (const org in orgMap) {
            const orgDiv = document.createElement('div');
            orgDiv.className = 'text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 pt-2 pb-1';
            orgDiv.textContent = org;
            checkboxList.appendChild(orgDiv);
            orgMap[org].forEach(repo => {
                const label = document.createElement('label');
                label.className = 'flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-indigo-50 cursor-pointer transition';
                label.innerHTML = `
                    <input type="checkbox" class="repo-checkbox w-3.5 h-3.5 accent-indigo-600 rounded"
                        value="${repo.owner.login}/${repo.name}" />
                    <span class="truncate text-gray-700">${repo.name}</span>
                `;
                checkboxList.appendChild(label);
            });
        }

        const updateLabel = () => {
            const checked = checkboxList.querySelectorAll('.repo-checkbox:checked');
            if (checked.length === 0) {
                repoLabel.textContent = '📦 Semua Repository';
                repoLabel.className = 'text-gray-500 truncate';
            } else if (checked.length === 1) {
                repoLabel.textContent = checked[0].value.split('/')[1];
                repoLabel.className = 'text-gray-800 font-medium truncate';
            } else {
                repoLabel.textContent = `${checked.length} repository dipilih`;
                repoLabel.className = 'text-indigo-600 font-medium truncate';
            }
        };

        checkboxList.addEventListener('change', updateLabel);
        updateLabel();

        // Dropdown open/close
        repoBtn.onclick = (e) => { e.stopPropagation(); repoPanel.classList.toggle('hidden'); };
        document.addEventListener('click', () => repoPanel.classList.add('hidden'));
        repoPanel.addEventListener('click', e => e.stopPropagation());

        selectAllBtn.onclick = () => {
            checkboxList.querySelectorAll('.repo-checkbox').forEach(cb => cb.checked = true);
            updateLabel();
        };
        deselectAllBtn.onclick = () => {
            checkboxList.querySelectorAll('.repo-checkbox').forEach(cb => cb.checked = false);
            updateLabel();
        };

        // Search filter
        const repoSearch = document.getElementById('repoSearch');
        if (repoSearch) {
            repoSearch.addEventListener('input', () => {
                const q = repoSearch.value.toLowerCase().trim();
                checkboxList.querySelectorAll('label').forEach(lbl => {
                    const name = lbl.querySelector('span')?.textContent.toLowerCase() || '';
                    lbl.style.display = (!q || name.includes(q)) ? '' : 'none';
                });
                // Show/hide org headers based on whether any repo under them is visible
                checkboxList.querySelectorAll('div').forEach(header => {
                    // Org headers are direct children divs (not labels), find the next sibling labels
                    let next = header.nextElementSibling;
                    let anyVisible = false;
                    while (next && next.tagName === 'LABEL') {
                        if (next.style.display !== 'none') anyVisible = true;
                        next = next.nextElementSibling;
                    }
                    header.style.display = anyVisible ? '' : 'none';
                });
            });
        }

        // Clear search and focus when dropdown opens
        const origOnClick = repoBtn.onclick;
        repoBtn.onclick = (e) => {
            e.stopPropagation();
            repoPanel.classList.toggle('hidden');
            if (!repoPanel.classList.contains('hidden') && repoSearch) {
                repoSearch.value = '';
                repoSearch.dispatchEvent(new Event('input')); // reset filter
                setTimeout(() => repoSearch.focus(), 50);
            }
        };
    }



    // --- MULTI-ACCOUNT MANAGEMENT ---
    const LINKED_ACCOUNTS_KEY = 'gitea_linked_accounts';

    function getLinkedAccounts() {
        try { return JSON.parse(localStorage.getItem(LINKED_ACCOUNTS_KEY) || '[]'); } catch { return []; }
    }
    function saveLinkedAccounts(accounts) {
        localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(accounts));
    }

    function initMultiAccount() {
        const addAccountBtn = document.getElementById('addAccountBtn');
        const modal = document.getElementById('addAccountModal');
        const modalClose = document.getElementById('addAccountModalClose');
        const cancelBtn = document.getElementById('addAccountCancel');
        const saveBtn = document.getElementById('addAccountSave');
        const usernameInput = document.getElementById('newAccountUsername');
        const passwordInput = document.getElementById('newAccountPassword');
        const errorMsg = document.getElementById('addAccountError');

        if (!addAccountBtn) return;

        const openModal = () => {
            modal.classList.remove('hidden-view');
            usernameInput.value = '';
            passwordInput.value = '';
            errorMsg.classList.add('hidden-view');
            usernameInput.focus();
        };
        const closeModal = () => modal.classList.add('hidden-view');

        addAccountBtn.addEventListener('click', openModal);
        modalClose.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        saveBtn.addEventListener('click', async () => {
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();
            if (!username || !password) {
                errorMsg.textContent = 'Username dan password wajib diisi.';
                errorMsg.classList.remove('hidden-view');
                return;
            }

            saveBtn.textContent = 'Memverifikasi...';
            saveBtn.disabled = true;

            try {
                // Obtain PAT via login API
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Login gagal');

                const accounts = getLinkedAccounts();
                if (accounts.find(a => a.login === username)) {
                    errorMsg.textContent = `Akun "${username}" sudah ditambahkan.`;
                    errorMsg.classList.remove('hidden-view');
                    saveBtn.textContent = 'Tambah';
                    saveBtn.disabled = false;
                    return;
                }

                accounts.push({ login: username, pat: data.token, avatar_url: data.avatar_url || '' });
                saveLinkedAccounts(accounts);
                renderLinkedAccountChips();
                // Merge repos from the new account
                await fetchLinkedAccountRepos();
                closeModal();
            } catch (err) {
                errorMsg.textContent = err.message || 'Gagal menambahkan akun.';
                errorMsg.classList.remove('hidden-view');
            } finally {
                saveBtn.textContent = 'Tambah';
                saveBtn.disabled = false;
            }
        });

        renderLinkedAccountChips();
        // Silently merge linked account repos with the main user repos
        fetchLinkedAccountRepos();
    }

    function renderLinkedAccountChips() {
        const row = document.getElementById('linkedAccountsRow');
        const noMsg = document.getElementById('noLinkedAccountsMsg');
        const addBtn = document.getElementById('addAccountBtn');
        if (!row) return;

        // Remove existing chips (keep noMsg and addBtn)
        [...row.children].forEach(c => {
            if (c !== noMsg && c !== addBtn) c.remove();
        });

        const accounts = getLinkedAccounts();
        if (accounts.length === 0) {
            noMsg.classList.remove('hidden-view');
        } else {
            noMsg.classList.add('hidden-view');
            accounts.forEach(acct => {
                const chip = document.createElement('span');
                chip.className = 'inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-full px-2.5 py-0.5 font-medium';
                chip.innerHTML = `
                    ${acct.avatar_url ? `<img src="${acct.avatar_url}" class="w-4 h-4 rounded-full">` : ''}
                    ${escapeHtml(acct.login)}
                    <button data-login="${escapeHtml(acct.login)}" class="linked-acct-remove ml-1 text-indigo-400 hover:text-red-500 transition font-bold leading-none">&times;</button>
                `;
                row.insertBefore(chip, addBtn);
            });
            // Wire remove buttons
            row.querySelectorAll('.linked-acct-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    const login = btn.dataset.login;
                    const updated = getLinkedAccounts().filter(a => a.login !== login);
                    saveLinkedAccounts(updated);
                    // Remove their repos from userProjects
                    userProjects = userProjects.filter(p => p._fromAccount !== login);
                    // Re-render sidebar
                    const sidebar = document.getElementById('projectsSidebar');
                    const countSpan = document.getElementById('sidebarRepoCount');
                    const loader = document.getElementById('projectsLoader');
                    renderSidebar(userProjects, sidebar, countSpan, loader);
                    renderLinkedAccountChips();
                });
            });
        }
    }

    async function fetchLinkedAccountRepos() {
        const accounts = getLinkedAccounts();
        if (accounts.length === 0) return;

        for (const acct of accounts) {
            try {
                const res = await fetch('/api/projects', {
                    headers: { 'Authorization': `Bearer ${acct.pat}` }
                });
                if (!res.ok) continue;
                const repos = await res.json();
                // Tag repos with source account and merge (avoid duplicates by full_name)
                const existing = new Set(userProjects.map(p => p.full_name));
                repos.forEach(r => {
                    r._fromAccount = acct.login;
                    r._accountPat = acct.pat;
                    if (!existing.has(r.full_name)) {
                        userProjects.push(r);
                        existing.add(r.full_name);
                    }
                });
            } catch (err) {
                console.warn(`Could not fetch repos for linked account ${acct.login}:`, err);
            }
        }

        // Re-render sidebar with merged repos
        const sidebar = document.getElementById('projectsSidebar');
        const countSpan = document.getElementById('sidebarRepoCount');
        const loader = document.getElementById('projectsLoader');
        if (sidebar) renderSidebar(userProjects, sidebar, countSpan, loader);
    }


    async function fetchExportHistory() {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">Memuat riwayat...</div>';
        try {
            const res = await fetch('/api/exports', {
                headers: { 'Authorization': `Bearer ${localPAT}` }
            });
            if (res.ok) {
                const exports = await res.json();
                renderExportHistory(exports);
            } else {
                historyList.innerHTML = '<div class="p-4 text-center text-red-400 text-sm">Gagal memuat riwayat.</div>';
            }
        } catch (err) {
            historyList.innerHTML = '<div class="p-4 text-center text-red-400 text-sm">Gagal memuat riwayat.</div>';
        }
    }

    function renderExportHistory(exports) {
        const historyList = document.getElementById('historyList');
        if (exports.length === 0) {
            historyList.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">Belum ada export yang tersimpan.</div>';
            return;
        }
        historyList.innerHTML = '';
        exports.forEach(exp => {
            const date = new Date(exp.createdAt).toLocaleString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const sizeKb = (exp.size / 1024).toFixed(1);
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition gap-3';
            row.innerHTML = `
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-gray-800 text-xs truncate" title="${escapeHtml(exp.filename)}">${escapeHtml(exp.filename)}</p>
                    <p class="text-gray-400 text-[11px] mt-0.5">${date} &bull; ${sizeKb} KB</p>
                </div>
                <div class="flex gap-2 flex-shrink-0">
                    <a
                        href="${escapeHtml(exp.downloadUrl)}"
                        download
                        class="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded font-medium transition"
                    >⬇ Unduh</a>
                    <button
                        onclick="window._deleteExport('${escapeHtml(exp.filename)}')"
                        class="text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2.5 py-1 rounded font-medium transition"
                    >Hapus</button>
                </div>
            `;
            historyList.appendChild(row);
        });

        // Expose delete handler
        window._deleteExport = async (filename) => {
            if (!confirm(`Hapus file "${filename}"?`)) return;
            try {
                const res = await fetch(`/api/exports/${encodeURIComponent(filename)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${localPAT}` }
                });
                if (res.ok) {
                    fetchExportHistory();
                } else {
                    alert('Gagal menghapus file.');
                }
            } catch (err) {
                alert('Terjadi error saat menghapus file.');
            }
        };
    }

    function isMergeCommit(commit) {
        const msg = (commit.title || commit.message || '').trim().toLowerCase();
        return msg.startsWith('merge pull request') ||
               msg.startsWith('merge branch') ||
               msg.startsWith('merge remote-tracking branch') ||
               /^merge .+ into .+/i.test(msg);
    }

    function renderTasks(commits, isInitializing = false) {
        const tasksTableBody = document.getElementById('tasksTableBody');
        const taskCountSpan = document.getElementById('taskCount');
        const noTasksMsg = document.getElementById('noTasksMsg');

        const filterMerge = document.getElementById('filterMergeCheckbox')?.checked;

        // Apply merge filter if checkbox is checked
        const displayCommits = filterMerge
            ? commits.filter(c => !isMergeCommit(c))
            : commits;

        tasksTableBody.innerHTML = '';
        taskCountSpan.textContent = displayCommits.length;
        
        if (displayCommits.length > 0) {
            noTasksMsg.classList.add('hidden-view');
            
            displayCommits.forEach((commit, idx) => {
                const title = commit.title || commit.message.split('\n')[0];
                const dateObj = new Date(commit.created_at);
                const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                // Get the real index in the full currentCommits for edit/delete
                const realIdx = currentCommits.indexOf(commit);

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-indigo-50 transition border-b border-gray-100 last:border-0';
                tr.innerHTML = `
                    <td class="px-4 py-3 align-top whitespace-nowrap">${idx + 1}</td>
                    <td class="px-4 py-3 align-top font-medium text-gray-900">${escapeHtml(title)}</td>
                    <td class="px-4 py-3 align-top text-xs text-gray-500 max-w-sm"><div class="line-clamp-2" title="${escapeHtml(commit.message)}">${escapeHtml(commit.message)}</div></td>
                    <td class="px-4 py-3 align-top whitespace-nowrap"><span class="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded text-[10px] font-bold tracking-wide uppercase">${escapeHtml(commit.projectName)}</span></td>
                    <td class="px-4 py-3 align-top whitespace-nowrap text-xs">${dateStr}</td>
                    <td class="px-4 py-3 align-top whitespace-nowrap">
                        <div class="flex gap-1.5">
                            <button
                                onclick="window._openEditModal(${realIdx})"
                                class="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded font-medium transition"
                            >Edit</button>
                            <button
                                onclick="if(confirm('Hapus task ini?')) window._deleteRow(${realIdx})"
                                class="text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2 py-1 rounded font-medium transition"
                            >Hapus</button>
                        </div>
                    </td>
                `;
                tasksTableBody.appendChild(tr);
            });
        }
    }


    // Loader Helper
    function showLoader(isLoading, button, text) {
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = `<svg class="animate-spin h-5 w-5 mr-2 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${text}`;
        } else {
            button.disabled = false;
            button.innerHTML = text;
        }
    }

    // XSS Helper
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // --- HISTORY PAGE LOGIC ---
    async function initHistoryPage() {
        initUserHeader();
        const loader = document.getElementById('historyLoader');
        const emptyMsg = document.getElementById('historyEmpty');
        const list = document.getElementById('historyList');

        try {
            const res = await fetch('/api/exports', {
                headers: { 'Authorization': `Bearer ${localPAT}` }
            });
            if (!res.ok) throw new Error('Failed');
            const exports = await res.json();
            loader.classList.add('hidden-view');

            if (exports.length === 0) {
                emptyMsg.classList.remove('hidden-view');
                return;
            }

            list.classList.remove('hidden-view');
            exports.forEach(exp => {
                const date = new Date(exp.createdAt).toLocaleString('id-ID', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                const sizeKb = (exp.size / 1024).toFixed(1);
                const li = document.createElement('li');
                li.className = 'flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition';
                li.innerHTML = `
                    <div class="flex items-center gap-4 flex-1 min-w-0">
                        <div class="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        </div>
                        <div class="min-w-0">
                            <p class="font-semibold text-gray-800 text-sm truncate">${escapeHtml(exp.filename)}</p>
                            <p class="text-gray-400 text-xs mt-0.5">${date} &bull; ${sizeKb} KB</p>
                        </div>
                    </div>
                    <div class="flex gap-2 flex-shrink-0 ml-4">
                        <a
                            href="${escapeHtml(exp.downloadUrl)}"
                            download
                            class="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-lg transition"
                        >
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                            Unduh
                        </a>
                        <button
                            onclick="window._deleteHistoryExport('${escapeHtml(exp.filename)}', this.closest('li'))"
                            class="flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-medium px-3 py-1.5 rounded-lg transition"
                        >Hapus</button>
                    </div>
                `;
                list.appendChild(li);
            });

            window._deleteHistoryExport = async (filename, rowEl) => {
                if (!confirm(`Hapus "${filename}"?`)) return;
                const r = await fetch(`/api/exports/${encodeURIComponent(filename)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${localPAT}` }
                });
                if (r.ok) {
                    rowEl.remove();
                    if (list.children.length === 0) {
                        list.classList.add('hidden-view');
                        emptyMsg.classList.remove('hidden-view');
                    }
                } else {
                    alert('Gagal menghapus file.');
                }
            };

        } catch (err) {
            loader.innerHTML = '<p class="text-red-400 text-sm">Gagal memuat riwayat.</p>';
        }
    }

    // Initialize checking authentication
    if (isDashboard || isLogin || isHistory) {
        checkAuth();
    }
});
