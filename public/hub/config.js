/*
 * School Hub registry.
 * Edit this single file to add branches and apps — the hub renders itself
 * from this data. No build step required.
 *
 *   status: 'live'  → tile is clickable and opens `url`
 *           'soon'  → tile is shown as "Coming soon" (greyed out)
 *   branches: ['*'] → available at every branch; or list branch ids.
 */
window.HUB_CONFIG = {
  org: {
    name: 'Yayasan Pendidikan Jayawijaya',
    short: 'YPJ',
    tagline: 'School Operations Hub',
    logoUrl: '', // optional image URL for the sidebar crest
  },

  branches: [
    { id: 'all', name: 'All Branches' },
    { id: 'main', name: 'Main Campus' },
    { id: 'elementary', name: 'Elementary School' },
    { id: 'highschool', name: 'High School' },
  ],

  apps: [
    {
      id: 'assets',
      name: 'Asset Management',
      icon: '🏷️',
      desc: 'Track assets, depreciation, faults, loans & compliance.',
      url: 'https://school-assets-production.up.railway.app',
      status: 'live',
      branches: ['*'],
    },
    {
      id: 'drill',
      name: 'Kuala Kencana Drill',
      icon: '🚨',
      desc: 'Real-time emergency evacuation drill tracking & reporting.',
      url: 'https://web-production-ad2db.up.railway.app',
      status: 'live',
      branches: ['*'],
    },
    {
      id: 'attendance',
      name: 'Attendance',
      icon: '🗓️',
      desc: 'Daily student & staff attendance records.',
      url: '',
      status: 'soon',
      branches: ['*'],
    },
    {
      id: 'library',
      name: 'Library',
      icon: '📚',
      desc: 'Catalogue, lending & returns.',
      url: '',
      status: 'soon',
      branches: ['*'],
    },
    {
      id: 'finance',
      name: 'Finance & Fees',
      icon: '💳',
      desc: 'Tuition, budgeting & financial reports.',
      url: '',
      status: 'soon',
      branches: ['*'],
    },
    {
      id: 'lms',
      name: 'Learning Portal',
      icon: '🎓',
      desc: 'Courses, assignments & grades.',
      url: '',
      status: 'soon',
      branches: ['*'],
    },
  ],
};
