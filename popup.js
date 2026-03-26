'use strict';

const HOUR_OPTIONS = [
  { hours: 1, newHours: 0.95,  days: 0.125 },
  { hours: 2, newHours: 1.9,   days: 0.25  },
  { hours: 3, newHours: 2.85,  days: 0.375 },
  { hours: 4, newHours: 3.8,   days: 0.5   },
  { hours: 5, newHours: 4.75,  days: 0.625 },
  { hours: 6, newHours: 5.7,   days: 0.75  },
  { hours: 7, newHours: 6.65,  days: 0.875 },
  { hours: 8, newHours: 7.6,   days: 1.0   },
];

// Populate conversion table
const tbody = document.getElementById('conversion-table');
HOUR_OPTIONS.forEach(({ hours, newHours, days }) => {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${hours}</td><td>${newHours}</td><td>${days}</td>`;
  tbody.appendChild(tr);
});
