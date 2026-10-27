const BIBLE_BOOKS = [
  // Antiguo Testamento
  { num: 1,  name: "Génesis",        chapters: 50 },
  { num: 2,  name: "Éxodo",          chapters: 40 },
  { num: 3,  name: "Levítico",       chapters: 27 },
  { num: 4,  name: "Números",        chapters: 36 },
  { num: 5,  name: "Deuteronomio",   chapters: 34 },
  { num: 6,  name: "Josué",          chapters: 24 },
  { num: 7,  name: "Jueces",         chapters: 21 },
  { num: 8,  name: "Rut",            chapters: 4  },
  { num: 9,  name: "1 Samuel",       chapters: 31 },
  { num: 10, name: "2 Samuel",       chapters: 24 },
  { num: 11, name: "1 Reyes",        chapters: 22 },
  { num: 12, name: "2 Reyes",        chapters: 25 },
  { num: 13, name: "1 Crónicas",     chapters: 29 },
  { num: 14, name: "2 Crónicas",     chapters: 36 },
  { num: 15, name: "Esdras",         chapters: 10 },
  { num: 16, name: "Nehemías",       chapters: 13 },
  { num: 17, name: "Ester",          chapters: 10 },
  { num: 18, name: "Job",            chapters: 42 },
  { num: 19, name: "Salmos",         chapters: 150 },
  { num: 20, name: "Proverbios",     chapters: 31 },
  { num: 21, name: "Eclesiastés",    chapters: 12 },
  { num: 22, name: "Cantares",       chapters: 8  },
  { num: 23, name: "Isaías",         chapters: 66 },
  { num: 24, name: "Jeremías",       chapters: 52 },
  { num: 25, name: "Lamentaciones",  chapters: 5  },
  { num: 26, name: "Ezequiel",       chapters: 48 },
  { num: 27, name: "Daniel",         chapters: 12 },
  { num: 28, name: "Oseas",          chapters: 14 },
  { num: 29, name: "Joel",           chapters: 3  },
  { num: 30, name: "Amós",           chapters: 9  },
  { num: 31, name: "Abdías",         chapters: 1  },
  { num: 32, name: "Jonás",          chapters: 4  },
  { num: 33, name: "Miqueas",        chapters: 7  },
  { num: 34, name: "Nahúm",          chapters: 3  },
  { num: 35, name: "Habacuc",        chapters: 3  },
  { num: 36, name: "Sofonías",       chapters: 3  },
  { num: 37, name: "Hageo",          chapters: 2  },
  { num: 38, name: "Zacarías",       chapters: 14 },
  { num: 39, name: "Malaquías",      chapters: 4  },
  // Nuevo Testamento
  { num: 40, name: "Mateo",          chapters: 28 },
  { num: 41, name: "Marcos",         chapters: 16 },
  { num: 42, name: "Lucas",          chapters: 24 },
  { num: 43, name: "Juan",           chapters: 21 },
  { num: 44, name: "Hechos",         chapters: 28 },
  { num: 45, name: "Romanos",        chapters: 16 },
  { num: 46, name: "1 Corintios",    chapters: 16 },
  { num: 47, name: "2 Corintios",    chapters: 13 },
  { num: 48, name: "Gálatas",        chapters: 6  },
  { num: 49, name: "Efesios",        chapters: 6  },
  { num: 50, name: "Filipenses",     chapters: 4  },
  { num: 51, name: "Colosenses",     chapters: 4  },
  { num: 52, name: "1 Tesalonicenses", chapters: 5 },
  { num: 53, name: "2 Tesalonicenses", chapters: 3 },
  { num: 54, name: "1 Timoteo",      chapters: 6  },
  { num: 55, name: "2 Timoteo",      chapters: 4  },
  { num: 56, name: "Tito",           chapters: 3  },
  { num: 57, name: "Filemón",        chapters: 1  },
  { num: 58, name: "Hebreos",        chapters: 13 },
  { num: 59, name: "Santiago",       chapters: 5  },
  { num: 60, name: "1 Pedro",        chapters: 5  },
  { num: 61, name: "2 Pedro",        chapters: 3  },
  { num: 62, name: "1 Juan",         chapters: 5  },
  { num: 63, name: "2 Juan",         chapters: 1  },
  { num: 64, name: "3 Juan",         chapters: 1  },
  { num: 65, name: "Judas",          chapters: 1  },
  { num: 66, name: "Apocalipsis",    chapters: 22 },
];

function populateBookSelect(selectEl) {
  selectEl.innerHTML = '<option value="">-- Libro --</option>';
  BIBLE_BOOKS.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.num;
    opt.dataset.chapters = b.chapters;
    opt.textContent = b.name;
    selectEl.appendChild(opt);
  });
}

function populateChapterSelect(selectEl, bookNum) {
  const book = BIBLE_BOOKS.find(b => b.num === parseInt(bookNum));
  const max = book ? book.chapters : 1;
  selectEl.innerHTML = '';
  for (let i = 1; i <= max; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    selectEl.appendChild(opt);
  }
}
