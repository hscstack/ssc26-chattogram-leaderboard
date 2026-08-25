document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const searchInput = document.getElementById('search-input');
  const btnSelectDistrict = document.getElementById('btn-select-district');
  const btnSelectUpazilla = document.getElementById('btn-select-upazilla');
  const btnSelectSchool = document.getElementById('btn-select-school');
  const btnSelectGroup = document.getElementById('btn-select-group');
  
  const labelDistrict = document.getElementById('label-district');
  const labelUpazilla = document.getElementById('label-upazilla');
  const labelSchool = document.getElementById('label-school');
  const labelGroup = document.getElementById('label-group');

  // Selection Modal Elements
  const selectionModal = document.getElementById('selection-modal');
  const selectionModalInner = document.getElementById('selection-modal-inner');
  const selectionModalClose = document.getElementById('selection-modal-close');
  const selectionModalTitle = document.getElementById('selection-modal-title');
  const selectionModalSearchContainer = document.getElementById('selection-modal-search-container');
  const selectionModalSearch = document.getElementById('selection-modal-search');
  const selectionModalBody = document.getElementById('selection-modal-body');

  const leaderboardBody = document.getElementById('leaderboard-body');
  const leaderboardContainer = document.getElementById('leaderboard-container');
  
  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const emptyState = document.getElementById('empty-state');
  
  const statStudents = document.getElementById('stat-students');
  const statSchools = document.getElementById('stat-schools');
  const statGpa5 = document.getElementById('stat-gpa5');
  const statDistricts = document.getElementById('stat-districts');
  const statSchoolsContainer = document.getElementById('stat-schools-container');
  const statDistrictsContainer = document.getElementById('stat-districts-container');
  
  const paginationContainer = document.getElementById('pagination-container');
  const pageSizeSelect = document.getElementById('page-size');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pageNumbersContainer = document.getElementById('page-numbers');
  
  // Modal Elements
  const modal = document.getElementById('student-modal');
  const modalContentInner = document.getElementById('modal-content-inner');
  const modalClose = document.getElementById('modal-close');
  const modalName = document.getElementById('modal-name');
  const modalStatus = document.getElementById('modal-status');
  const modalSchool = document.getElementById('modal-school');
  const modalRollRow = document.getElementById('modal-roll-row');
  const modalRoll = document.getElementById('modal-roll');
  const modalGpa = document.getElementById('modal-gpa');
  const modalMarks = document.getElementById('modal-marks');
  const modalGradesSection = document.getElementById('modal-grades-section');
  const modalGrades = document.getElementById('modal-grades');
  const modalStudentHeader = document.getElementById('modal-student-header');
  const modalSchoolsHeader = document.getElementById('modal-schools-header');
  const modalStudentBody = document.getElementById('modal-student-body');
  const modalSchoolsBody = document.getElementById('modal-schools-body');

  const pageTitleText = document.getElementById('page-title-text');

  const takedownBtn = document.getElementById('takedown-btn');
  const takedownModal = document.getElementById('takedown-modal');
  const takedownModalInner = document.getElementById('takedown-modal-inner');
  const takedownClose = document.getElementById('takedown-close');

  const newSchoolBtn = document.getElementById('new-school-btn');
  const newSchoolModal = document.getElementById('new-school-modal');
  const newSchoolModalInner = document.getElementById('new-school-modal-inner');
  const newSchoolClose = document.getElementById('new-school-close');

  const welcomeModal = document.getElementById('welcome-modal');
  const welcomeModalInner = document.getElementById('welcome-modal-inner');
  const welcomeClose = document.getElementById('welcome-close');

  const authModal = document.getElementById('auth-modal');
  const authModalInner = document.getElementById('auth-modal-inner');
  const authModalClose = document.getElementById('auth-modal-close');
  const authLoginBtn = document.getElementById('auth-login-btn');

  // State
  let isLoggedIn = null;
  let rawData = [];
  let filteredData = [];
  let currentPage = 1;
  let itemsPerPage = 25;

  let selectedDistrict = 'all';
  let selectedUpazilla = 'all';
  let selectedSchool = 'all';
  let selectedGroup = 'all';

  let districtsList = [];
  let upazillasList = [];
  let schoolsList = [];
  let groupsList = [];

  // Helpers for text formatting
  function formatDistrictName(name) {
    if (!name) return '';
    let str = String(name).trim().toUpperCase().replace(/_/g, ' ');
    if (str === 'COX S BAZAR') str = "COX'S BAZAR";
    return str;
  }

  function formatUpazillaName(name) {
    if (!name) return '';
    let str = String(name).trim().toUpperCase().replace(/_/g, ' ');
    str = str.replace(/\bCOX S\b/g, "COX'S");
    return str;
  }

  const detailFileCache = new Map();

  // Initialization
  init();

  async function init() {
    try {
      let loadedFromPrecomputed = false;

      try {
        const [metaRes, rankedRes] = await Promise.all([
          fetch('data/metadata.json'),
          fetch('data/leaderboard_ranked.json')
        ]);

        if (metaRes.ok && rankedRes.ok) {
          const metadata = await metaRes.json();
          rawData = await rankedRes.json();

          districtsList = metadata.districts || [];
          upazillasList = metadata.upazillas || [];
          schoolsList = metadata.schools || [];
          groupsList = metadata.groups || [];

          statStudents.textContent = Number(metadata.total_students || 0).toLocaleString();
          statSchools.textContent = Number(metadata.total_schools || 0).toLocaleString();
          statGpa5.textContent = Number(metadata.total_gpa5 || 0).toLocaleString();
          statDistricts.textContent = Number(metadata.total_districts || 0).toLocaleString();

          loadedFromPrecomputed = true;
        }
      } catch (e) {
        console.warn('Precomputed data not available, falling back to manifest loading:', e);
      }

      if (!loadedFromPrecomputed) {
        await loadFromManifestFallback();
        setupData();
      }

      if (rawData.length === 0) {
        showState('empty');
        return;
      }

      applyFilters();

      // Event Listeners
      searchInput.addEventListener('click', handleSearchFocusOrClick);
      searchInput.addEventListener('focus', handleSearchFocusOrClick);
      searchInput.addEventListener('input', handleSearchInput);
      btnSelectDistrict.addEventListener('click', async () => {
        const auth = await checkUserAuth();
        if (!auth) return openAuthModal();
        openSelectionModal('district');
      });
      if (btnSelectUpazilla) {
        btnSelectUpazilla.addEventListener('click', async () => {
          const auth = await checkUserAuth();
          if (!auth) return openAuthModal();
          openSelectionModal('upazilla');
        });
      }
      btnSelectSchool.addEventListener('click', async () => {
        const auth = await checkUserAuth();
        if (!auth) return openAuthModal();
        openSelectionModal('school');
      });
      btnSelectGroup.addEventListener('click', () => openSelectionModal('group'));

      if (authModalClose) {
        authModalClose.addEventListener('click', closeAuthModal);
      }
      if (authModal) {
        authModal.addEventListener('click', (e) => {
          if (e.target === authModal) closeAuthModal();
        });
      }
      if (authLoginBtn) {
        authLoginBtn.addEventListener('click', () => {
          window.location.href = 'https://hscstack.site/login?redirect=' + encodeURIComponent(window.location.href);
        });
      }

      selectionModalClose.addEventListener('click', closeSelectionModal);
      selectionModal.addEventListener('click', (e) => {
        if (e.target === selectionModal) closeSelectionModal();
      });
      pageSizeSelect.addEventListener('change', handlePageSizeChange);
      btnPrev.addEventListener('click', () => changePage(-1));
      btnNext.addEventListener('click', () => changePage(1));
      statSchoolsContainer.addEventListener('click', showSchoolsModal);
      statDistrictsContainer.addEventListener('click', showDistrictsModal);

      // Modal Close
      modalClose.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (!modal.classList.contains('hidden')) closeModal();
          if (takedownModal && !takedownModal.classList.contains('hidden')) closeTakedownModal();
          if (newSchoolModal && !newSchoolModal.classList.contains('hidden')) closeNewSchoolModal();
          if (selectionModal && !selectionModal.classList.contains('hidden')) closeSelectionModal();
          if (welcomeModal && !welcomeModal.classList.contains('hidden')) closeWelcomeModal();
        }
      });

      // Takedown Modal
      if (takedownBtn) {
        takedownBtn.addEventListener('click', (e) => {
          e.preventDefault();
          openTakedownModal();
        });
      }
      if (takedownClose) {
        takedownClose.addEventListener('click', closeTakedownModal);
      }
      if (takedownModal) {
        takedownModal.addEventListener('click', (e) => {
          if (e.target === takedownModal) closeTakedownModal();
        });
      }

      // New School Modal
      if (newSchoolBtn) {
        newSchoolBtn.addEventListener('click', (e) => {
          e.preventDefault();
          openNewSchoolModal();
        });
      }
      if (newSchoolClose) {
        newSchoolClose.addEventListener('click', closeNewSchoolModal);
      }
      if (newSchoolModal) {
        newSchoolModal.addEventListener('click', (e) => {
          if (e.target === newSchoolModal) closeNewSchoolModal();
        });
      }

      // Welcome Modal
      if (!sessionStorage.getItem('welcome_seen')) {
        openWelcomeModal();
      }
      if (welcomeClose) {
        welcomeClose.addEventListener('click', closeWelcomeModal);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      showState('error');
    }
  }

  async function loadFromManifestFallback() {
    const manifestResponse = await fetch('data/manifest.json');
    if (!manifestResponse.ok) throw new Error('Failed to fetch manifest');
    const files = await manifestResponse.json();

    const requests = files.map(file => fetch(`data/${file}`).then(res => {
      if (!res.ok) throw new Error(`Failed to fetch data/${file}`);
      return res.json();
    }));

    const results = await Promise.all(requests);

    const entityDiv = document.createElement('div');
    const allStudents = [];

    results.forEach(item => {
      let fileDistrict = '';
      let fileUpazilla = '';
      let records = [];

      if (Array.isArray(item)) {
        records = item;
      } else if (item && typeof item === 'object') {
        fileDistrict = item.district || item.zilla || '';
        fileUpazilla = item.upazilla || item.thana || '';
        records = Array.isArray(item.records) ? item.records : [];
      }

      records.forEach(r => {
        let name = r.name ? String(r.name).trim() : 'UNKNOWN';
        entityDiv.innerHTML = name;
        name = entityDiv.textContent || name;

        let school = r.school || r.institution_name || 'UNKNOWN';
        entityDiv.innerHTML = school;
        school = entityDiv.textContent || school;

        const roll = r.roll !== undefined && r.roll !== null ? String(r.roll).trim() : '';

        let district = r.district || r.zilla || fileDistrict || '';
        district = formatDistrictName(district);

        let upazilla = r.upazilla || r.thana || fileUpazilla || '';
        upazilla = formatUpazillaName(upazilla);

        let mark = 0;
        if (r.total_mark !== undefined && r.total_mark !== null) {
          mark = parseInt(r.total_mark, 10) || 0;
        } else if (r.mark !== undefined && r.mark !== null) {
          mark = parseInt(r.mark, 10) || 0;
        }

        let gpa = 0.0;
        let status = 'PASSED';
        const rawGrade = r.grade !== undefined && r.grade !== null ? String(r.grade).trim().toUpperCase() : null;
        const rawGpa = r.gpa !== undefined && r.gpa !== null ? parseFloat(r.gpa) : null;

        if (rawGrade === 'FAIL' || r.status === 'FAILED') {
          gpa = 0.0;
          status = 'FAILED';
        } else if (rawGpa !== null && !isNaN(rawGpa)) {
          gpa = rawGpa;
          status = r.status || (gpa > 0 ? 'PASSED' : 'FAILED');
        } else if (rawGrade !== null) {
          const parsed = parseFloat(rawGrade);
          if (!isNaN(parsed)) {
            gpa = parsed;
            status = 'PASSED';
          } else {
            gpa = 0.0;
            status = 'FAILED';
          }
        }

        let group = '';
        if (r.group && typeof r.group === 'string' && r.group.trim()) {
          group = r.group.toUpperCase().trim();
        } else if (r.subjects && Array.isArray(r.subjects) && r.subjects.length > 0) {
          const codes = new Set(r.subjects.map(s => String(s.code || '').trim()));
          const subNames = r.subjects.map(s => String(s.subject || '').toUpperCase());

          const isScience = codes.has('136') || codes.has('137') || codes.has('138') || codes.has('126') ||
            subNames.some(s => s.includes('PHYSICS') || s.includes('CHEMISTRY') || s.includes('BIOLOGY') || s.includes('HIGHER MATHEMATICS'));

          const isBusiness = codes.has('146') || codes.has('152') || codes.has('143') ||
            subNames.some(s => s.includes('ACCOUNTING') || s.includes('FINANCE') || s.includes('BUSINESS'));

          const isHumanities = codes.has('140') || codes.has('153') || codes.has('110') || codes.has('141') || codes.has('151') ||
            subNames.some(s => s.includes('CIVICS') || s.includes('HISTORY') || s.includes('GEOGRAPHY') || s.includes('ECONOMICS'));

          if (isScience) group = 'SCIENCE';
          else if (isBusiness) group = 'BUSINESS STUDIES';
          else if (isHumanities) group = 'HUMANITIES';
          else group = 'OTHER';
        } else {
          group = 'OTHER';
        }

        let subjects = [];
        let grades = {};
        if (r.subjects && Array.isArray(r.subjects)) {
          subjects = r.subjects;
          r.subjects.forEach(s => {
            if (s && s.subject) {
              grades[s.subject] = s.grade || '';
            }
          });
        } else if (r.grades && typeof r.grades === 'object') {
          grades = r.grades;
          Object.entries(r.grades).forEach(([sub, gr]) => {
            subjects.push({ subject: sub, grade: gr });
          });
        }

        allStudents.push({
          name,
          roll,
          school,
          district,
          upazilla,
          mark,
          gpa,
          status,
          group,
          grades,
          subjects
        });
      });
    });

    rawData = allStudents;
  }

  function setupData() {
    // 1. Sort the entire dataset by GPA (desc) then Marks (desc)
    rawData.sort((a, b) => {
      if (b.gpa !== a.gpa) return b.gpa - a.gpa;
      return b.mark - a.mark;
    });

    // 2. Assign global rank and extract unique schools, districts, upazillas, groups
    const uniqueSchools = new Set();
    const uniqueDistricts = new Set();
    const uniqueUpazillas = new Set();
    const uniqueGroups = new Set();
    let currentGlobalRank = 1;

    for (let i = 0; i < rawData.length; i++) {
      const student = rawData[i];
      if (i > 0) {
        const prev = rawData[i - 1];
        if (student.gpa !== prev.gpa || student.mark !== prev.mark) {
          currentGlobalRank = i + 1;
        }
      }
      student.globalRank = currentGlobalRank;
      
      if (student.school) uniqueSchools.add(student.school.toUpperCase());
      if (student.district) uniqueDistricts.add(student.district.toUpperCase());
      if (student.upazilla) uniqueUpazillas.add(student.upazilla.toUpperCase());
      if (student.group) uniqueGroups.add(student.group.toUpperCase());
    }

    // 3. Assign school-specific rank
    uniqueSchools.forEach(school => {
      const schoolStudents = rawData.filter(s => s.school && s.school.toUpperCase() === school);
      
      schoolStudents.sort((a, b) => {
        if (b.gpa !== a.gpa) return b.gpa - a.gpa;
        return b.mark - a.mark;
      });
      
      let currentSchoolRank = 1;
      for (let i = 0; i < schoolStudents.length; i++) {
        const student = schoolStudents[i];
        if (i > 0) {
          const prev = schoolStudents[i - 1];
          if (student.gpa !== prev.gpa || student.mark !== prev.mark) {
            currentSchoolRank = i + 1;
          }
        }
        student.schoolRank = currentSchoolRank;
      }
    });

    // 4. Save sorted lists for modal selection
    districtsList = Array.from(uniqueDistricts).sort();
    upazillasList = Array.from(uniqueUpazillas).sort();
    schoolsList = Array.from(uniqueSchools).sort();
    groupsList = Array.from(uniqueGroups).sort();
  }

  async function checkUserAuth() {
    if (isLoggedIn !== null) return isLoggedIn;
    try {
      const res = await fetch('https://hscstack.site/api/auth/status', {
        method: 'GET',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        isLoggedIn = Boolean(data.authenticated);
      } else {
        isLoggedIn = false;
      }
    } catch (e) {
      isLoggedIn = false;
    }
    return isLoggedIn;
  }

  function openAuthModal() {
    if (!authModal) return;
    authModal.classList.remove('hidden');
    setTimeout(() => {
      authModal.classList.add('opacity-100');
      authModal.classList.remove('opacity-0', 'pointer-events-none');
      authModalInner.classList.remove('scale-95', 'translate-y-8');
      authModalInner.classList.add('scale-100', 'translate-y-0');
    }, 10);
  }

  function closeAuthModal() {
    if (!authModal) return;
    authModal.classList.remove('opacity-100');
    authModal.classList.add('opacity-0', 'pointer-events-none');
    authModalInner.classList.add('scale-95', 'translate-y-8');
    authModalInner.classList.remove('scale-100', 'translate-y-0');
    setTimeout(() => {
      authModal.classList.add('hidden');
    }, 300);
  }

  async function handleSearchFocusOrClick() {
    const authenticated = await checkUserAuth();
    if (!authenticated) {
      searchInput.blur();
      openAuthModal();
    }
  }

  async function handleSearchInput() {
    const authenticated = await checkUserAuth();
    if (!authenticated) {
      searchInput.value = '';
      searchInput.blur();
      openAuthModal();
      return;
    }
    handleFilterChange();
  }

  function handleFilterChange() {
    currentPage = 1;
    applyFilters();
  }

  function handlePageSizeChange() {
    itemsPerPage = parseInt(pageSizeSelect.value, 10);
    currentPage = 1;
    renderLeaderboard();
  }

  function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase().trim();

    let contextData = rawData.filter(student => {
      const matchSchool = selectedSchool === 'all' || 
                         (student.school && student.school.toUpperCase() === selectedSchool.toUpperCase());
      const matchDistrict = selectedDistrict === 'all' ||
                           (student.district && student.district.toUpperCase() === selectedDistrict.toUpperCase());
      const matchUpazilla = selectedUpazilla === 'all' ||
                           (student.upazilla && student.upazilla.toUpperCase() === selectedUpazilla.toUpperCase());
      const matchGroup = selectedGroup === 'all' ||
                        (student.group && student.group.toUpperCase() === selectedGroup.toUpperCase());
      return matchSchool && matchDistrict && matchUpazilla && matchGroup;
    });

    const hasContextFilter = selectedSchool !== 'all' || selectedDistrict !== 'all' || selectedUpazilla !== 'all' || selectedGroup !== 'all';

    if (hasContextFilter) {
      // Sort by GPA (desc) then Mark (desc) to ensure correct ranking order
      contextData.sort((a, b) => {
        if (b.gpa !== a.gpa) return b.gpa - a.gpa;
        return b.mark - a.mark;
      });

      // Assign dynamic rank starting from 1 for context
      let currentRank = 1;
      for (let i = 0; i < contextData.length; i++) {
        const student = contextData[i];
        if (i > 0) {
          const prev = contextData[i - 1];
          if (student.gpa !== prev.gpa || student.mark !== prev.mark) {
            currentRank = i + 1;
          }
        }
        student.displayRank = currentRank;
      }
    } else {
      // Use pre-calculated global rank
      contextData.forEach(student => {
        student.displayRank = student.globalRank;
      });
      contextData.sort((a, b) => a.globalRank - b.globalRank);
    }

    // Apply text search on top of context data
    filteredData = contextData.filter(student => {
      const matchName = !searchTerm || (student.name && student.name.toLowerCase().includes(searchTerm));
      const matchRoll = !searchTerm || (student.roll && student.roll.toLowerCase().includes(searchTerm));
      return matchName || matchRoll;
    });

    if (pageTitleText) {
      let titleParts = [];
      if (selectedSchool !== 'all') {
        const displayName = selectedSchool.length > 25 ? selectedSchool.substring(0, 25) + '...' : selectedSchool;
        titleParts.push(displayName);
      } else if (selectedUpazilla !== 'all') {
        titleParts.push(selectedUpazilla);
      } else if (selectedDistrict !== 'all') {
        titleParts.push(selectedDistrict);
      }
      if (selectedGroup !== 'all') {
        titleParts.push(selectedGroup);
      }
      
      if (titleParts.length > 0) {
        pageTitleText.textContent = `${titleParts.join(' - ')} Leaderboard`;
      } else {
        pageTitleText.textContent = `Chattogram Board Leaderboard`;
      }
    }

    updateStats();
    
    if (filteredData.length === 0) {
      showState('empty');
    } else {
      renderLeaderboard();
    }
  }

  function updateStats() {
    animateValue(statStudents, 0, filteredData.length, 1000);
    
    const currentSchools = new Set();
    const currentDistricts = new Set();
    let gpa5Count = 0;
    
    filteredData.forEach(s => {
      if (s.school) currentSchools.add(s.school.toUpperCase());
      if (s.district) currentDistricts.add(s.district.toUpperCase());
      if (parseFloat(s.gpa) === 5.0) gpa5Count++;
    });
    
    animateValue(statSchools, 0, currentSchools.size, 1000);
    animateValue(statGpa5, 0, gpa5Count, 1000);
    animateValue(statDistricts, 0, currentDistricts.size, 1000);
  }

  // Animation for stat numbers
  function animateValue(obj, start, end, duration) {
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const current = Math.floor(progress * (end - start) + start);
      
      obj.innerHTML = current.toLocaleString();
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }

  function renderLeaderboard() {
    showState('leaderboard');
    
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      currentPage = totalPages;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);
    
    leaderboardBody.innerHTML = '';
    
    pageData.forEach((student) => {
      const row = document.createElement('div');
      
      let rankColor = 'text-slate-600 bg-slate-100 group-hover:bg-white group-hover:shadow-sm border border-transparent';
      let mobileRankBadge = 'bg-slate-100 text-slate-700';
      if (student.displayRank === 1) {
        rankColor = 'text-amber-700 bg-amber-50 border-amber-200 shadow-sm';
        mobileRankBadge = 'bg-amber-100 text-amber-800 border border-amber-200';
      } else if (student.displayRank === 2) {
        rankColor = 'text-slate-700 bg-slate-100 border-slate-200 shadow-sm';
        mobileRankBadge = 'bg-slate-200 text-slate-800 border border-slate-300';
      } else if (student.displayRank === 3) {
        rankColor = 'text-orange-800 bg-orange-50 border-orange-200 shadow-sm';
        mobileRankBadge = 'bg-orange-100 text-orange-800 border border-orange-200';
      }
      
      const safeSchool = student.school ? student.school.toUpperCase() : 'N/A';
      const safeGpa = typeof student.gpa === 'number' ? student.gpa.toFixed(2) : student.gpa;
      
      // Mobile-friendly card format for small screens, table row for large screens
      row.className = 'group flex flex-col sm:flex-row sm:items-center bg-white border border-slate-200 sm:border-0 sm:border-b sm:border-slate-100 rounded-xl sm:rounded-none p-4 sm:p-4 cursor-pointer hover:bg-slate-50 hover:border-indigo-200 sm:hover:border-transparent transition-all shadow-sm sm:shadow-none';
      
      row.innerHTML = `
        <!-- Mobile View (visible block sm:hidden) -->
        <div class="flex sm:hidden flex-col gap-3 w-full">
          <div class="flex justify-between items-start w-full">
            <div class="flex flex-col gap-1 pr-2">
              <div class="font-bold text-slate-800 text-base leading-snug group-hover:text-indigo-600 transition-colors break-words">${escapeHTML(student.name)}</div>
              <div class="text-xs uppercase leading-tight line-clamp-2 font-semibold text-slate-500">
                ${escapeHTML(safeSchool)}
              </div>
            </div>
            <div class="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${mobileRankBadge}">
              #${student.displayRank}
            </div>
          </div>
          <div class="flex justify-between items-center pt-2 border-t border-slate-100 w-full mt-1">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">GPA</span>
              <span class="font-black text-slate-800 text-sm">${safeGpa}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Marks</span>
              <span class="font-black text-indigo-700 text-sm">${student.mark}</span>
            </div>
          </div>
        </div>

        <!-- Desktop View (visible sm:flex hidden) -->
        <div class="hidden sm:flex items-center w-full">
          <div class="w-16 flex justify-center shrink-0">
            <div class="flex items-center justify-center w-10 h-10 rounded-xl font-bold text-base transition-all ${rankColor}">
              ${student.displayRank}
            </div>
          </div>
          <div class="flex-1 px-4 min-w-0">
            <div class="font-bold text-slate-800 mb-0.5 text-base truncate group-hover:text-indigo-600 transition-colors">${escapeHTML(student.name)}</div>
            <div class="text-sm uppercase truncate font-semibold text-slate-500">
              ${escapeHTML(safeSchool)}
            </div>
          </div>
          <div class="w-20 text-right font-bold text-slate-700 text-base shrink-0">${safeGpa}</div>
          <div class="w-20 text-right font-black text-slate-900 text-base shrink-0">${student.mark}</div>
          <div class="w-8 flex justify-end shrink-0 pl-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-300 transition-all duration-200 group-hover:translate-x-1 group-hover:text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
          </div>
        </div>
      `;
      
      row.addEventListener('click', () => openModal(student));
      leaderboardBody.appendChild(row);
    });
    
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) {
      paginationContainer.classList.add('hidden');
      return;
    }
    
    paginationContainer.classList.remove('hidden');
    paginationContainer.classList.add('flex');
    btnPrev.disabled = currentPage === 1;
    btnNext.disabled = currentPage === totalPages;
    
    pageNumbersContainer.innerHTML = '';
    
    // Simple logic for page numbers (show max 5)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement('div');
      btn.className = `w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl cursor-pointer font-bold shrink-0 transition-all ${currentPage === i ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;
      btn.textContent = i;
      btn.addEventListener('click', () => {
        currentPage = i;
        renderLeaderboard();
        scrollToTop();
      });
      pageNumbersContainer.appendChild(btn);
    }
  }

  function changePage(delta) {
    currentPage += delta;
    renderLeaderboard();
    scrollToTop();
  }

  function scrollToTop() {
    const offset = leaderboardContainer.getBoundingClientRect().top + window.scrollY - 20;
    window.scrollTo({ top: offset, behavior: 'smooth' });
  }

  function showSchoolsModal() {
    const uniqueSchools = new Set();
    filteredData.forEach(s => {
      if (s.school) uniqueSchools.add(s.school.toUpperCase());
    });
    const sortedSchools = Array.from(uniqueSchools).sort();

    modalSchoolsHeader.querySelector('h3').textContent = 'Participating Schools';
    modalSchoolsHeader.querySelector('span').textContent = 'List of Schools';
    modalSchoolsBody.innerHTML = '';
    sortedSchools.forEach(school => {
      const el = document.createElement('div');
      el.className = 'py-2 px-3 bg-slate-50 border border-slate-100 rounded-lg text-slate-800 font-semibold text-sm';
      el.textContent = school;
      modalSchoolsBody.appendChild(el);
    });

    modalStudentHeader.classList.add('hidden');
    modalStudentBody.classList.add('hidden');
    modalSchoolsHeader.classList.remove('hidden');
    modalSchoolsBody.classList.remove('hidden');

    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.add('opacity-100');
      modal.classList.remove('opacity-0', 'pointer-events-none');
      modalContentInner.classList.remove('scale-95', 'translate-y-8');
      modalContentInner.classList.add('scale-100', 'translate-y-0');
    }, 10);
  }

  function showDistrictsModal() {
    const uniqueDistricts = new Set();
    filteredData.forEach(s => {
      if (s.district) uniqueDistricts.add(s.district.toUpperCase());
    });
    const sortedDistricts = Array.from(uniqueDistricts).sort();

    modalSchoolsHeader.querySelector('h3').textContent = 'Participating Districts';
    modalSchoolsHeader.querySelector('span').textContent = 'List of Districts';
    modalSchoolsBody.innerHTML = '';
    sortedDistricts.forEach(district => {
      const el = document.createElement('div');
      el.className = 'py-2 px-3 bg-slate-50 border border-slate-100 rounded-lg text-slate-800 font-semibold text-sm';
      el.textContent = district;
      modalSchoolsBody.appendChild(el);
    });

    modalStudentHeader.classList.add('hidden');
    modalStudentBody.classList.add('hidden');
    modalSchoolsHeader.classList.remove('hidden');
    modalSchoolsBody.classList.remove('hidden');

    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.add('opacity-100');
      modal.classList.remove('opacity-0', 'pointer-events-none');
      modalContentInner.classList.remove('scale-95', 'translate-y-8');
      modalContentInner.classList.add('scale-100', 'translate-y-0');
    }, 10);
  }

  let currentSelectionType = '';

  function openSelectionModal(type) {
    currentSelectionType = type;
    let list = [];
    let title = '';
    
    if (type === 'district') {
      title = 'Select District';
      list = districtsList;
      selectionModalSearchContainer.classList.remove('hidden');
    } else if (type === 'upazilla') {
      title = 'Select Upazilla';
      if (selectedDistrict !== 'all') {
        const matchingUpazillas = new Set();
        rawData
          .filter(s => s.district && s.district.toUpperCase() === selectedDistrict.toUpperCase())
          .forEach(s => { if (s.upazilla) matchingUpazillas.add(s.upazilla.toUpperCase()); });
        list = Array.from(matchingUpazillas).sort();
      } else {
        list = upazillasList;
      }
      selectionModalSearchContainer.classList.remove('hidden');
    } else if (type === 'school') {
      title = 'Select School';
      if (selectedDistrict !== 'all' || selectedUpazilla !== 'all') {
        const matchingSchools = new Set();
        rawData
          .filter(s => {
            const matchDist = selectedDistrict === 'all' || (s.district && s.district.toUpperCase() === selectedDistrict.toUpperCase());
            const matchUpaz = selectedUpazilla === 'all' || (s.upazilla && s.upazilla.toUpperCase() === selectedUpazilla.toUpperCase());
            return matchDist && matchUpaz;
          })
          .forEach(s => { if (s.school) matchingSchools.add(s.school.toUpperCase()); });
        list = Array.from(matchingSchools).sort();
      } else {
        list = schoolsList;
      }
      selectionModalSearchContainer.classList.remove('hidden');
    } else if (type === 'group') {
      title = 'Select Group';
      list = groupsList;
      selectionModalSearchContainer.classList.add('hidden');
    }
    
    selectionModalTitle.textContent = title;
    selectionModalSearch.value = '';
    renderSelectionList(list);
    
    // Search functionality inside modal
    selectionModalSearch.oninput = (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = list.filter(item => item.toLowerCase().includes(q));
      renderSelectionList(filtered);
    };

    selectionModal.classList.remove('hidden');
    setTimeout(() => {
      selectionModal.classList.add('opacity-100');
      selectionModal.classList.remove('opacity-0', 'pointer-events-none');
      selectionModalInner.classList.remove('scale-95', 'translate-y-8');
      selectionModalInner.classList.add('scale-100', 'translate-y-0');
      if (type !== 'group') selectionModalSearch.focus();
    }, 10);
  }

  function renderSelectionList(list) {
    selectionModalBody.innerHTML = '';
    
    // Add "All" option
    const allBtn = document.createElement('button');
    allBtn.className = 'w-full text-left py-3 px-4 bg-slate-50 border border-slate-100 rounded-xl text-slate-800 font-bold text-sm hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/20';
    allBtn.textContent = `All ${currentSelectionType.charAt(0).toUpperCase() + currentSelectionType.slice(1)}s`;
    allBtn.onclick = () => selectOption('all');
    selectionModalBody.appendChild(allBtn);
    
    list.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'w-full text-left py-3 px-4 bg-white border border-slate-100 rounded-xl text-slate-700 font-semibold text-sm hover:bg-slate-50 hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20';
      btn.textContent = item;
      btn.title = item;
      btn.onclick = () => selectOption(item);
      selectionModalBody.appendChild(btn);
    });
  }

  function selectOption(value) {
    if (currentSelectionType === 'district') {
      selectedDistrict = value;
      labelDistrict.textContent = value === 'all' ? 'All Districts' : value;
      labelDistrict.title = value === 'all' ? 'All Districts' : value;
      if (value !== 'all') labelDistrict.classList.add('text-teal-700');
      else labelDistrict.classList.remove('text-teal-700');

      // Reset upazilla and school if they don't belong to the newly selected district
      if (value !== 'all') {
        if (selectedUpazilla !== 'all') {
          const upazExists = rawData.some(s => s.district && s.district.toUpperCase() === value.toUpperCase() && s.upazilla && s.upazilla.toUpperCase() === selectedUpazilla.toUpperCase());
          if (!upazExists) {
            selectedUpazilla = 'all';
            if (labelUpazilla) {
              labelUpazilla.textContent = 'All Upazillas';
              labelUpazilla.classList.remove('text-teal-700');
            }
          }
        }
        if (selectedSchool !== 'all') {
          const schoolExists = rawData.some(s => s.district && s.district.toUpperCase() === value.toUpperCase() && s.school && s.school.toUpperCase() === selectedSchool.toUpperCase());
          if (!schoolExists) {
            selectedSchool = 'all';
            labelSchool.textContent = 'All Schools';
            labelSchool.classList.remove('text-teal-700');
          }
        }
      }
    } else if (currentSelectionType === 'upazilla') {
      selectedUpazilla = value;
      if (labelUpazilla) {
        labelUpazilla.textContent = value === 'all' ? 'All Upazillas' : value;
        labelUpazilla.title = value === 'all' ? 'All Upazillas' : value;
        if (value !== 'all') labelUpazilla.classList.add('text-teal-700');
        else labelUpazilla.classList.remove('text-teal-700');
      }

      if (value !== 'all' && selectedSchool !== 'all') {
        const schoolExists = rawData.some(s => s.upazilla && s.upazilla.toUpperCase() === value.toUpperCase() && s.school && s.school.toUpperCase() === selectedSchool.toUpperCase());
        if (!schoolExists) {
          selectedSchool = 'all';
          labelSchool.textContent = 'All Schools';
          labelSchool.classList.remove('text-teal-700');
        }
      }
    } else if (currentSelectionType === 'school') {
      selectedSchool = value;
      labelSchool.textContent = value === 'all' ? 'All Schools' : value;
      labelSchool.title = value === 'all' ? 'All Schools' : value;
      if (value !== 'all') labelSchool.classList.add('text-teal-700');
      else labelSchool.classList.remove('text-teal-700');
    } else if (currentSelectionType === 'group') {
      selectedGroup = value;
      labelGroup.textContent = value === 'all' ? 'All Groups' : value;
      labelGroup.title = value === 'all' ? 'All Groups' : value;
      if (value !== 'all') labelGroup.classList.add('text-teal-700');
      else labelGroup.classList.remove('text-teal-700');
    }
    
    closeSelectionModal();
    handleFilterChange();
  }

  function closeSelectionModal() {
    if (!selectionModal) return;
    selectionModal.classList.remove('opacity-100');
    selectionModal.classList.add('opacity-0', 'pointer-events-none');
    selectionModalInner.classList.add('scale-95', 'translate-y-8');
    selectionModalInner.classList.remove('scale-100', 'translate-y-0');
    
    setTimeout(() => {
      selectionModal.classList.add('hidden');
    }, 300);
  }

  async function getStudentSubjects(student) {
    if (student.subjects && student.subjects.length > 0) return student.subjects;
    if (!student.source_file) return [];

    if (!detailFileCache.has(student.source_file)) {
      try {
        const res = await fetch(`data/${student.source_file}`);
        if (res.ok) {
          const json = await res.json();
          const records = Array.isArray(json) ? json : (json.records || []);
          const mapByRoll = new Map();
          const mapByName = new Map();
          records.forEach(r => {
            if (r.roll) mapByRoll.set(String(r.roll).trim(), r.subjects || []);
            if (r.name) mapByName.set(String(r.name).trim().toUpperCase(), r.subjects || []);
          });
          detailFileCache.set(student.source_file, { byRoll: mapByRoll, byName: mapByName });
        } else {
          detailFileCache.set(student.source_file, null);
        }
      } catch (e) {
        console.warn('Failed to load student details:', e);
        detailFileCache.set(student.source_file, null);
      }
    }

    const cached = detailFileCache.get(student.source_file);
    if (cached) {
      const rollKey = String(student.roll || '').trim();
      const nameKey = String(student.name || '').trim().toUpperCase();
      student.subjects = (rollKey && cached.byRoll.get(rollKey)) || cached.byName.get(nameKey) || [];
    } else {
      student.subjects = [];
    }
    return student.subjects;
  }

  function renderModalGrades(subjects, grades) {
    modalGrades.innerHTML = '';
    let renderedCount = 0;

    if (subjects && subjects.length > 0) {
      for (const sub of subjects) {
        const code = String(sub.code || '').trim();
        const subName = String(sub.subject || '').toUpperCase().trim();
        if (code === '147' || code === '156' || subName.includes('PHYSICAL EDUCATION') || subName.includes('CAREER EDUCATION')) {
          continue;
        }

        let gradeColor = 'text-slate-700 bg-slate-100';
        if (sub.grade === 'A+') gradeColor = 'text-emerald-700 bg-emerald-100';
        else if (sub.grade === 'A') gradeColor = 'text-teal-700 bg-teal-100';
        else if (sub.grade === 'A-') gradeColor = 'text-cyan-700 bg-cyan-100';
        else if (sub.grade === 'B') gradeColor = 'text-blue-700 bg-blue-100';
        else if (sub.grade === 'C') gradeColor = 'text-amber-700 bg-amber-100';
        else if (sub.grade === 'D') gradeColor = 'text-orange-700 bg-orange-100';
        else if (sub.grade === 'F') gradeColor = 'text-red-700 bg-red-100';

        const markDisplay = sub.mark !== undefined && sub.mark !== null 
          ? `<span class="text-xs font-bold text-slate-500 font-mono">${sub.mark}</span>` 
          : '';

        const row = document.createElement('div');
        row.className = 'flex justify-between items-center py-1.5 px-3 bg-slate-50 rounded-lg border border-slate-100';
        row.innerHTML = `
          <span class="text-xs font-semibold text-slate-600 truncate mr-2" title="${escapeHTML(sub.subject)}">${escapeHTML(sub.subject)}</span>
          <div class="flex items-center gap-2 shrink-0">
            ${markDisplay}
            ${sub.grade ? `<span class="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${gradeColor}">${sub.grade}</span>` : ''}
          </div>
        `;
        modalGrades.appendChild(row);
        renderedCount++;
      }
    } else if (grades && Object.keys(grades).length > 0) {
      for (const [subject, grade] of Object.entries(grades)) {
        const subName = String(subject || '').toUpperCase().trim();
        if (subName.includes('PHYSICAL EDUCATION') || subName.includes('CAREER EDUCATION')) {
          continue;
        }

        let gradeColor = 'text-slate-700 bg-slate-100';
        if (grade === 'A+') gradeColor = 'text-emerald-700 bg-emerald-100';
        else if (grade === 'A') gradeColor = 'text-teal-700 bg-teal-100';
        else if (grade === 'A-') gradeColor = 'text-cyan-700 bg-cyan-100';
        else if (grade === 'B') gradeColor = 'text-blue-700 bg-blue-100';
        else if (grade === 'C') gradeColor = 'text-amber-700 bg-amber-100';
        else if (grade === 'D') gradeColor = 'text-orange-700 bg-orange-100';
        else if (grade === 'F') gradeColor = 'text-red-700 bg-red-100';

        const row = document.createElement('div');
        row.className = 'flex justify-between items-center py-1.5 px-3 bg-slate-50 rounded-lg border border-slate-100';
        row.innerHTML = `
          <span class="text-xs font-semibold text-slate-600 truncate mr-2" title="${escapeHTML(subject)}">${escapeHTML(subject)}</span>
          <span class="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold shrink-0 ${gradeColor}">${grade}</span>
        `;
        modalGrades.appendChild(row);
        renderedCount++;
      }
    }

    if (renderedCount > 0) {
      modalGradesSection.classList.remove('hidden');
    } else {
      modalGradesSection.classList.add('hidden');
    }
  }

  async function openModal(student) {
    modalStudentHeader.classList.remove('hidden');
    modalStudentBody.classList.remove('hidden');
    modalSchoolsHeader.classList.add('hidden');
    modalSchoolsBody.classList.add('hidden');

    modalName.textContent = student.name;
    const schoolName = student.school ? student.school.toUpperCase() : 'N/A';

    modalSchool.textContent = schoolName;
    modalSchool.className = 'text-slate-600 font-semibold uppercase tracking-wider text-sm break-words text-right max-w-[70%]';
    
    modalGpa.textContent = typeof student.gpa === 'number' ? student.gpa.toFixed(2) : student.gpa;
    modalMarks.textContent = student.mark;
    
    modalStatus.textContent = student.status || 'UNKNOWN';
    if (student.status && student.status.toUpperCase() !== 'PASSED') {
      modalStatus.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-red-100 text-red-700';
    } else {
      modalStatus.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700';
    }
    
    if (student.roll) {
      modalRoll.textContent = student.roll;
      modalRollRow.classList.remove('hidden');
      modalRollRow.classList.add('flex');
    } else {
      modalRollRow.classList.add('hidden');
      modalRollRow.classList.remove('flex');
    }

    // If subjects not yet in memory, show smooth loading spinner in the modal immediately
    if (!student.subjects && student.source_file) {
      modalGradesSection.classList.remove('hidden');
      modalGrades.innerHTML = `
        <div class="flex items-center justify-center py-6 text-slate-400 gap-2.5 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
          <svg class="animate-spin h-4 w-4 text-teal-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="text-xs font-semibold text-slate-500">Loading subject marks...</span>
        </div>
      `;
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.add('opacity-100');
      modal.classList.remove('opacity-0', 'pointer-events-none');
      modalContentInner.classList.remove('scale-95', 'translate-y-8');
      modalContentInner.classList.add('scale-100', 'translate-y-0');
    }, 10);

    // Fetch and render subjects
    const subjects = await getStudentSubjects(student);
    renderModalGrades(subjects, student.grades);
  }

  function closeModal() {
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0', 'pointer-events-none');
    modalContentInner.classList.add('scale-95', 'translate-y-8');
    modalContentInner.classList.remove('scale-100', 'translate-y-0');
    
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  }

  function openTakedownModal() {
    if (!takedownModal) return;
    takedownModal.classList.remove('hidden');
    setTimeout(() => {
      takedownModal.classList.add('opacity-100');
      takedownModal.classList.remove('opacity-0', 'pointer-events-none');
      takedownModalInner.classList.remove('scale-95', 'translate-y-8');
      takedownModalInner.classList.add('scale-100', 'translate-y-0');
    }, 10);
  }

  function closeTakedownModal() {
    if (!takedownModal) return;
    takedownModal.classList.remove('opacity-100');
    takedownModal.classList.add('opacity-0', 'pointer-events-none');
    takedownModalInner.classList.add('scale-95', 'translate-y-8');
    takedownModalInner.classList.remove('scale-100', 'translate-y-0');
    
    setTimeout(() => {
      takedownModal.classList.add('hidden');
    }, 300);
  }

  function openNewSchoolModal() {
    if (!newSchoolModal) return;
    newSchoolModal.classList.remove('hidden');
    setTimeout(() => {
      newSchoolModal.classList.add('opacity-100');
      newSchoolModal.classList.remove('opacity-0', 'pointer-events-none');
      newSchoolModalInner.classList.remove('scale-95', 'translate-y-8');
      newSchoolModalInner.classList.add('scale-100', 'translate-y-0');
    }, 10);
  }

  function closeNewSchoolModal() {
    if (!newSchoolModal) return;
    newSchoolModal.classList.remove('opacity-100');
    newSchoolModal.classList.add('opacity-0', 'pointer-events-none');
    newSchoolModalInner.classList.add('scale-95', 'translate-y-8');
    newSchoolModalInner.classList.remove('scale-100', 'translate-y-0');
    
    setTimeout(() => {
      newSchoolModal.classList.add('hidden');
    }, 300);
  }

  function openWelcomeModal() {
    if (!welcomeModal) return;
    welcomeModal.classList.remove('hidden');
    setTimeout(() => {
      welcomeModal.classList.add('opacity-100');
      welcomeModal.classList.remove('opacity-0', 'pointer-events-none');
      welcomeModalInner.classList.remove('scale-95', 'translate-y-8');
      welcomeModalInner.classList.add('scale-100', 'translate-y-0');
    }, 10);
  }

  function closeWelcomeModal() {
    if (!welcomeModal) return;
    welcomeModal.classList.remove('opacity-100');
    welcomeModal.classList.add('opacity-0', 'pointer-events-none');
    welcomeModalInner.classList.add('scale-95', 'translate-y-8');
    welcomeModalInner.classList.remove('scale-100', 'translate-y-0');
    sessionStorage.setItem('welcome_seen', 'true');
    
    setTimeout(() => {
      welcomeModal.classList.add('hidden');
    }, 300);
  }

  function showState(state) {
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
    emptyState.classList.add('hidden');
    leaderboardContainer.classList.add('hidden');
    paginationContainer.classList.add('hidden');
    paginationContainer.classList.remove('flex');
    
    switch (state) {
      case 'loading':
        loadingState.classList.remove('hidden');
        break;
      case 'error':
        errorState.classList.remove('hidden');
        break;
      case 'empty':
        emptyState.classList.remove('hidden');
        break;
      case 'leaderboard':
        leaderboardContainer.classList.remove('hidden');
        leaderboardContainer.classList.add('flex');
        break;
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});