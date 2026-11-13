// Konfiguracja Tailwind CSS (v3 – ta sama wersja, którą dawał skrypt cdn.tailwindcss.com).
// Tailwind skanuje pliki z „content” i generuje tylko użyte klasy. Klasy w JS muszą być
// zapisane w całości (np. 'text-[var(--c-spend)]'), nie sklejane z kawałków.
// Po zmianie klas w HTML/JS: npm run build:css (plik css/tailwind.css trafia do repozytorium).
module.exports = {
    content: ['./index.html', './js/**/*.js', '!./js/vendor/**'],
    darkMode: 'media',
    theme: { extend: {} },
    plugins: []
};
