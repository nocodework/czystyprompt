// Ręczne listy: tytuły, słowa, które nie są nazwiskami, zdrobnienia, tematy wrażliwe.

const set = (s) => new Set(s.trim().split(/\s+/));

// Zwroty grzecznościowe: po nich prawie zawsze stoi nazwisko lub imię, nawet nieznane
export const HONORIFICS = set(`
pan pani pana panu panem panią panie p. dr mgr inż. prof. hab. mecenas mec.
`);

// Słowa przed nazwiskiem/imieniem („Pan Kowalski”, „dyr. Nowak”)
export const TITLES = set(`
pan pani pana panu panem panią panie państwo państwa p. dyr. dyrektor dyrektora dyrektorowi dyrektorem
dyrektorka dyrektorki kierownik kierownika kierownikowi kierownikiem kierowniczka kierowniczki prezes prezesa
prezesowi prezesem mgr dr inż. prof. hab. kolega kolegi koledze kolegą koleżanka koleżanki koleżance koleżanką
pracownik pracownika pracownikowi pracownikiem pracownica pracownicy pracownicą kandydat kandydata kandydatowi
kandydatem kandydatka kandydatki kandydatce kandydatką szef szefa szefowi szefem szefowa szefowej mecenas
`);

// Formy podstawowe, których nigdy nie traktujemy jako nazwisk (miasta, kraje, nazwy własne)
export const NOT_SURNAMES = set(`
warszawa kraków łódź wrocław poznań gdańsk szczecin bydgoszcz lublin białystok katowice gdynia częstochowa radom
toruń sosnowiec rzeszów kielce gliwice olsztyn zabrze bytom opole tychy gorzów elbląg płock wałbrzych włocławek
tarnów chorzów koszalin kalisz legnica grudziądz słupsk siedlce konin piła gniezno pruszków głogów zamość chełm
leszno przemyśl łomża mielec tczew ełk pabianice świdnica zgierz bełchatów legionowo puławy sopot zakopane
polska niemcy francja anglia czechy słowacja ukraina litwa rosja hiszpania włochy holandia belgia szwecja norwegia
dania austria szwajcaria węgry rumunia grecja turcja chiny japonia indie ameryka kanada europa azja afryka
mazowsze śląsk pomorze małopolska wielkopolska podlasie kaszuby podhale warmia mazury
polak polka niemiec czech francuz anglik rosjanin ukrainiec litwin szwed
bank cel rok dzień godzina lato kasa praca rada pan sąd urząd firma spółka zarząd kodeks
excel teams word outlook google microsoft copilot claude gemini chatgpt openai make zoom slack jira asana notion
linkedin facebook instagram allegro orlen pekao santander mbank
boży boża święty święta nowy nowa stary stara wielki wielka mały mała duży duża papież
`);

// Przymiotniki od miejsc i instytucji: „Uniwersytet Warszawski”, „Politechnika Wrocławska”.
// Po rzeczowniku pisanym wielką literą traktujemy je jako część nazwy, nie nazwisko.
export const PLACE_ADJ = set(`
warszawski krakowski łódzki wrocławski poznański gdański szczeciński bydgoski lubelski białostocki katowicki
gdyński częstochowski radomski toruński sosnowiecki rzeszowski kielecki gliwicki olsztyński zabrzański bytomski
opolski tyski gorzowski elbląski płocki wałbrzyski włocławski tarnowski chorzowski koszaliński kaliski legnicki
grudziądzki słupski siedlecki koniński pilski gnieźnieński zamojski chełmski leszczyński przemyski łomżyński
mielecki sopocki zakopiański mazowiecki śląski dolnośląski pomorski zachodniopomorski kujawski małopolski
wielkopolski podkarpacki podlaski lubuski świętokrzyski warmiński mazurski kaszubski tatrzański bałtycki karpacki
sudecki beskidzki polski europejski amerykański niemiecki angielski brytyjski francuski włoski hiszpański czeski
słowacki ukraiński litewski rosyjski skandynawski marszałkowski królewski miejski wojewódzki akademicki
uniwersytecki ludowy narodowy państwowy główny centralny wojskowy medyczny ekonomiczny techniczny rolniczy
społeczny publiczny prywatny okręgowy rejonowy krajowy regionalny
`);

// Skróty i nazwy wielkimi literami, które nie są osobami
export const NOT_NAMES_UPPER = set(`
hr it ceo cfo cto coo kpi okr sla b2b b2c l4 krs nip pesel regon pit vat cit ppk zus nfz pip gus rodo ue ai api
crm erp faq pdf csv ok usa uk pl dw bhp
`);

// Imiona, które na początku zdania częściej są zwykłym słowem
export const FIRST_NAME_SENTENCE_STOP = set(`róża kalina malina jagoda nadzieja wiara sława lew wiktoria aurora`);

// Zdrobnienia → forma oficjalna (płeć)
export const DIMINUTIVES = {
  // kobiety
  ania: 'anna', anka: 'anna', kasia: 'katarzyna', kaśka: 'katarzyna', gosia: 'małgorzata', małgosia: 'małgorzata',
  gośka: 'małgorzata', asia: 'joanna', aśka: 'joanna', basia: 'barbara', baśka: 'barbara', zosia: 'zofia',
  ola: 'aleksandra', olka: 'aleksandra', ela: 'elżbieta', elka: 'elżbieta', ula: 'urszula', jola: 'jolanta',
  madzia: 'magdalena', magda: 'magdalena', aga: 'agnieszka', agusia: 'agnieszka', krysia: 'krystyna',
  jadzia: 'jadwiga', danka: 'danuta', danusia: 'danuta', marysia: 'maria', iza: 'izabela', gabrysia: 'gabriela',
  dorotka: 'dorota', ewka: 'ewa', ewunia: 'ewa', julka: 'julia', natka: 'natalia',
  werka: 'weronika', wera: 'weronika', wika: 'wiktoria', karolcia: 'karolina', emilka: 'emilia', tereska: 'teresa',
  irka: 'irena', renia: 'renata', halinka: 'halina', stasia: 'stanisława', wandzia: 'wanda', hela: 'helena',
  ala: 'alicja', alka: 'alicja', martynka: 'martyna', agatka: 'agata', iwonka: 'iwona', bożenka: 'bożena',
  // mężczyźni
  janek: 'jan', jasiek: 'jan', tomek: 'tomasz', piotrek: 'piotr', krzysiek: 'krzysztof', bartek: 'bartosz',
  wojtek: 'wojciech', kuba: 'jakub', maciek: 'maciej', grzesiek: 'grzegorz', staszek: 'stanisław', stasiek: 'stanisław',
  józek: 'józef', darek: 'dariusz', jarek: 'jarosław', mirek: 'mirosław', sławek: 'sławomir', radek: 'radosław',
  przemek: 'przemysław', zbyszek: 'zbigniew', rysiek: 'ryszard', heniek: 'henryk', tadek: 'tadeusz', kazik: 'kazimierz',
  wiesiek: 'wiesław', romek: 'roman', jurek: 'jerzy', antek: 'antoni', franek: 'franciszek', szymek: 'szymon',
  michałek: 'michał', adaś: 'adam', bogdanek: 'bogdan', marcinek: 'marcin', mati: 'mateusz', seba: 'sebastian',
  kamilek: 'kamil', olek: 'aleksander', mietek: 'mieczysław', edek: 'edward', władek: 'władysław',
  czesiek: 'czesław', zdzisiek: 'zdzisław', bolek: 'bolesław', lolek: 'karol', gienek: 'eugeniusz',
};

export const DIMINUTIVE_GENDER = (dim) => {
  const formal = DIMINUTIVES[dim];
  if (!formal) return null;
  return formal.endsWith('a') && formal !== 'kuba' ? 'f' : 'm';
};

// Dane szczególnych kategorii (art. 9 i 10 RODO) — ostrzegamy, nie podmieniamy.
// \b w JS nie zna polskich liter, więc granice słów robimy lookaroundami.
const rx = (body) => new RegExp(`(?<![\\p{L}\\d])(?:${body})(?![\\p{L}\\d])`, 'giu');
const W = '\\p{L}*';

export const SENSITIVE_TOPICS = [
  { label: 'zdrowie', re: rx(`l4|zwolnieni${W} lekarsk${W}|chorob${W}|chor${W} na|diagnoz${W}|leczeni${W}|szpital${W}|terapi${W}|depresj${W}|nowotw${W}|leki|leków|lekami|niepełnospraw${W}|orzeczeni${W} o|ciąż${W}|poronieni${W}|psychiatr${W}|psycholog${W}|uzależnieni${W}|alkohol${W}`) },
  { label: 'związki zawodowe', re: rx(`związ${W} zawodow${W}`) },
  { label: 'wyznanie', re: rx(`wyznani${W}|religi${W}|katoli${W}|muzułma${W}|żyd${W}|świad${W} jehowy`) },
  { label: 'orientacja seksualna', re: rx(`orientacj${W} seksualn${W}|homoseksual${W}|lesbijk${W}|gej|gejem|geja|gejów|transpł${W}`) },
  { label: 'pochodzenie', re: rx(`pochodzeni${W} etniczn${W}|narodowoś${W}|rasa|rasy|rasie|rasą|rasow${W}`) },
  { label: 'poglądy polityczne', re: rx(`poglą${W} polityczn${W}|partii politycznej|członk${W} partii`) },
  { label: 'karalność', re: rx(`karaln${W}|wyrok${W}|skazan${W}|kartotek${W}|niekaralnoś${W}`) },
];
