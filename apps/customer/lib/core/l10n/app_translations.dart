/// UI copy is keyed by the original Turkish label: Turkmen, Russian, English.
/// Names, descriptions and addresses returned by the API are left untouched.
class AppTranslations {
  const AppTranslations._();

  static String translate(String source, String code) {
    final column = switch (code) {
      'ru' => 1,
      'en' => 2,
      _ => 0,
    };
    final exact = _copy[source];
    if (exact != null) return exact[column];
    for (final entry in _patterns) {
      final match = entry.pattern.firstMatch(source);
      if (match != null) return entry.format(match, column);
    }
    return source;
  }

  static final _patterns = <_Pattern>[
    _Pattern(
      RegExp(r'^(\d+) arama sonucu$'),
      (m, i) =>
          '${m[1]} ${['gözleg netijesi', 'результатов поиска', 'search results'][i]}',
    ),
    _Pattern(
      RegExp(r'^(\d+) lezzet$'),
      (m, i) => '${m[1]} ${['tagam', 'блюд', 'dishes'][i]}',
    ),
    _Pattern(
      RegExp(r'^(\d+) sipariş$'),
      (m, i) => '${m[1]} ${['sargyt', 'заказов', 'orders'][i]}',
    ),
    _Pattern(
      RegExp(r'^(\d+) kayıt$'),
      (m, i) => '${m[1]} ${['ýazgy', 'записей', 'records'][i]}',
    ),
    _Pattern(
      RegExp(r'^(\d+) ürün · Toplam$'),
      (m, i) =>
          '${m[1]} ${['önüm · Jemi', 'товаров · Итого', 'items · Total'][i]}',
    ),
    _Pattern(
      RegExp(r'^(\d+) dk$'),
      (m, i) => '${m[1]} ${['min', 'мин', 'min'][i]}',
    ),
    _Pattern(
      RegExp(r'^Yaklaşık (\d+) dk$'),
      (m, i) =>
          '${['Takmynan', 'Примерно', 'About'][i]} ${m[1]} ${['min', 'мин', 'min'][i]}',
    ),
    _Pattern(
      RegExp(r'^Sepetinizde (\d+) adet var$'),
      (m, i) => '${['Sebediňizde', 'В корзине', 'In your cart'][i]} ${m[1]}',
    ),
    _Pattern(
      RegExp(r'^Sipariş #(.*) alındı$'),
      (m, i) =>
          '${['Sargyt', 'Заказ', 'Order'][i]} #${m[1]} ${['kabul edildi', 'принят', 'received'][i]}',
    ),
    _Pattern(
      RegExp(r'^Sipariş #(.+) · (.+)$'),
      (m, i) =>
          '${['Sargyt', 'Заказ', 'Order'][i]} #${m[1]} · ${translate(m[2]!, ['tk', 'ru', 'en'][i])}',
    ),
    _Pattern(
      RegExp(r'^Sipariş #(.*)$'),
      (m, i) => '${['Sargyt', 'Заказ', 'Order'][i]} #${m[1]}',
    ),
    _Pattern(
      RegExp(r'^Yerel test SMS kodu: (.+)$'),
      (m, i) =>
          '${['Ýerli synag SMS kody:', 'Тестовый SMS код:', 'Local test SMS code:'][i]} ${m[1]}',
    ),
    _Pattern(
      RegExp(r'^(.+) sepete ekle$'),
      (m, i) =>
          '${['Sebede goş', 'Добавить в корзину', 'Add to cart'][i]}: ${m[1]}',
    ),
    _Pattern(
      RegExp(
        r'^(\d+) ürün sepetinizden kaldırılacak\.\nBu işlem geri alınamaz\.$',
      ),
      (m, i) =>
          '${m[1]} ${['önüm sebediňizden aýrylar.\nBu hereketi yzyna gaýtaryp bolmaýar.', 'товаров будут удалены из корзины.\nЭто действие нельзя отменить.', 'items will be removed from your cart.\nThis cannot be undone.'][i]}',
    ),
  ];

  static const _copy = <String, List<String>>{
    // Navigation, home and shared actions.
    'Profilim': ['Profilim', 'Профиль', 'Profile'],
    'Profil': ['Profil', 'Профиль', 'Profile'],
    'Kafeler': ['Kafeler', 'Кафе', 'Cafes'],
    'Menü': ['Menýu', 'Меню', 'Menu'],
    'Sepet': ['Sebet', 'Корзина', 'Cart'],
    'Sepetim': ['Sebedim', 'Моя корзина', 'My cart'],
    'Siparişlerim': ['Sargytlarym', 'Мои заказы', 'My orders'],
    'Geri': ['Yza', 'Назад', 'Back'],
    'Yenile': ['Täzele', 'Обновить', 'Refresh'],
    'Ara': ['Gözle', 'Поиск', 'Search'],
    'Aramayı temizle': ['Gözlegi arassala', 'Очистить поиск', 'Clear search'],
    'Daha fazla': ['Has köp', 'Ещё', 'More'],
    'Vazgeç': ['Ýatyr', 'Отмена', 'Cancel'],
    'Değiştir': ['Üýtget', 'Сменить', 'Change'],
    'Devam et': ['Dowam et', 'Продолжить', 'Continue'],
    'Bugün ne yiyelim?': [
      'Şu gün näme iýeli?',
      'Что поедим сегодня?',
      'What shall we eat today?',
    ],
    'Sevdiğin lezzetleri Saçakly’de bul': [
      'Halaýan tagamlaryňy Saçakly-da tap',
      'Найдите любимые блюда в Saçakly',
      'Find your favorites on Saçakly',
    ],
    'Yemek ara': ['Tagam gözle', 'Найти блюдо', 'Search dishes'],
    'Yemek veya malzeme ara': [
      'Tagam ýa-da goşundy gözle',
      'Найти блюдо или ингредиент',
      'Search dishes or ingredients',
    ],
    'Kafeyi değiştir?': [
      'Kafeni üýtgetmelimi?',
      'Сменить кафе?',
      'Change cafe?',
    ],
    'Mevcut sepet temizlenecek.': [
      'Häzirki sebet arassalanar.',
      'Текущая корзина будет очищена.',
      'Your current cart will be cleared.',
    ],
    'Örnek menü gösteriliyor. Sipariş için sunucuya bağlanın.': [
      'Synag menýusy görkezilýär. Sargyt üçin serwere birigiň.',
      'Показано демо меню. Для заказа подключитесь к серверу.',
      'Showing a sample menu. Connect to the server to order.',
    ],
    'Henüz açık kafe yok': [
      'Häzirlikçe açyk kafe ýok',
      'Пока нет открытых кафе',
      'No cafes are open yet',
    ],
    'Keşfet': ['Açyp gör', 'Открыть', 'Explore'],
    'Yemek kategorileri': [
      'Tagam kategoriýalary',
      'Категории блюд',
      'Food categories',
    ],
    'Kategoriler': ['Kategoriýalar', 'Категории', 'Categories'],
    'Liste görünümü': ['Sanaw görnüşi', 'Список', 'List view'],
    'Izgara görünümü': ['Gözenek görnüşi', 'Сетка', 'Grid view'],
    'Tümü': ['Hemmesi', 'Все', 'All'],
    'Tüm menü': ['Doly menýu', 'Всё меню', 'Full menu'],
    'Ne yemek istersin?': [
      'Näme iýmek isleýärsiň?',
      'Что хочется съесть?',
      'What are you craving?',
    ],
    'Yemeğin adını veya malzemesini yaz, hemen bulalım': [
      'Tagamyň adyny ýa-da düzümini ýaz, derrew taparys',
      'Введите название блюда или ингредиент — найдём сразу',
      'Type a dish or an ingredient and we will find it',
    ],
    'Nereden sipariş vermek istersiniz?': [
      'Nireden sargyt etmek isleýärsiňiz?',
      'Откуда хотите заказать?',
      'Where would you like to order from?',
    ],
    'Öne çıkan lezzetler': [
      'Saýlanan tagamlar',
      'Популярные блюда',
      'Featured dishes',
    ],
    'Arama sonuçları': [
      'Gözleg netijeleri',
      'Результаты поиска',
      'Search results',
    ],
    'Kafeyi seç': ['Kafeni saýla', 'Выбрать кафе', 'Choose cafe'],
    'Kafeye göz at': ['Kafä seret', 'Посмотреть кафе', 'View cafe'],
    'Kafe değiştir ›': ['Kafeni üýtget ›', 'Сменить кафе ›', 'Change cafe ›'],
    'SEÇİLİ KAFE': ['SAÝLANAN KAFE', 'ВЫБРАННОЕ КАФЕ', 'SELECTED CAFE'],

    // Menu and product.
    'Önce bir kafe seçin': [
      'Ilki kafe saýlaň',
      'Сначала выберите кафе',
      'Choose a cafe first',
    ],
    'Bir kafe seçtiğinizde menüsündeki lezzetler burada görünecek.': [
      'Kafe saýlanyňyzda onuň tagamlary şu ýerde görkeziler.',
      'После выбора кафе здесь появятся его блюда.',
      'Once you choose a cafe, its dishes will appear here.',
    ],
    'Kafelere göz at': ['Kafelere seret', 'Посмотреть кафе', 'Browse cafes'],
    'Bugün ne yemek istersiniz?': [
      'Şu gün näme iýmek isleýärsiňiz?',
      'Что хотите поесть сегодня?',
      'What would you like to eat today?',
    ],
    'Menü güncellenemedi. Tekrar deneyin.': [
      'Menýuny täzeläp bolmady. Gaýtadan synanyşyň.',
      'Не удалось обновить меню. Попробуйте ещё раз.',
      'Could not update the menu. Try again.',
    ],
    'Menü henüz boş': [
      'Menýu entek boş',
      'Меню пока пусто',
      'The menu is empty',
    ],
    'Bu kafe yeni yemeklerini eklediğinde burada göreceksiniz.': [
      'Bu kafe täze tagamlaryny goşanda şu ýerde görersiňiz.',
      'Новые блюда этого кафе появятся здесь.',
      'New dishes from this cafe will appear here.',
    ],
    'Lezzet bulunamadı': [
      'Tagam tapylmady',
      'Блюда не найдены',
      'No dishes found',
    ],
    'Başka bir kelime veya kategori deneyin.': [
      'Başga söz ýa-da kategoriýa synanyşyň.',
      'Попробуйте другое слово или категорию.',
      'Try another word or category.',
    ],
    'Filtreleri temizle': [
      'Süzgüçleri arassala',
      'Сбросить фильтры',
      'Clear filters',
    ],
    'Fiyat yok': ['Bahasy ýok', 'Цена не указана', 'No price'],
    'Sepete ekle': ['Sebede goş', 'В корзину', 'Add to cart'],
    'Seçenek seçin': [
      'Görnüşini saýlaň',
      'Выберите вариант',
      'Choose an option',
    ],
    'Kategori': ['Kategoriýa', 'Категория', 'Category'],
    'Başlangıç': ['Başlangyç', 'От', 'From'],
    'Açıklama': ['Düşündiriş', 'Описание', 'Description'],
    'Bu ürün için açıklama eklenmemiş.': [
      'Bu tagam üçin düşündiriş goşulmady.',
      'Для этого блюда нет описания.',
      'No description for this dish.',
    ],
    'Daha az göster': ['Azrak görkez', 'Свернуть', 'Show less'],
    'Devamını oku': ['Dowamyny oka', 'Читать далее', 'Read more'],
    'Hazırlanma': ['Taýýarlanyşy', 'Приготовление', 'Preparation'],
    'BU ÜRÜNÜ HAZIRLAYAN KAFE': [
      'BU TAGAMY TAÝÝARLAÝAN KAFE',
      'КАФЕ, КОТОРОЕ ГОТОВИТ БЛЮДО',
      'PREPARED BY',
    ],
    'Konum bilgisi eklenmemiş': [
      'Ýerleşýän ýeri görkezilmedi',
      'Адрес не указан',
      'Location not available',
    ],
    'Ürün bilgisi kopyalandı': [
      'Tagam maglumatlary göçürildi',
      'Информация о блюде скопирована',
      'Product information copied',
    ],
    'Ürün sepete eklendi': [
      'Tagam sebede goşuldy',
      'Блюдо добавлено в корзину',
      'Added to cart',
    ],
    'Favorilerden çıkar': [
      'Halanlarymdan aýyr',
      'Убрать из избранного',
      'Remove from favorites',
    ],
    'Favorilere ekle': ['Halanlaryma goş', 'В избранное', 'Add to favorites'],
    'Ürün bilgisini kopyala': [
      'Tagam maglumatlaryny göçür',
      'Скопировать информацию о блюде',
      'Copy product details',
    ],

    // Cart and checkout.
    'Örnek menüde sipariş verilemez. Önce sunucuya bağlanın.': [
      'Synag menýusyndan sargyt edip bolmaýar. Ilki serwere birigiň.',
      'В демо меню нельзя оформить заказ. Подключитесь к серверу.',
      'Orders are unavailable in the sample menu. Connect to the server first.',
    ],
    'Örnek menüde sipariş verilemez. Sunucuya bağlanın.': [
      'Synag menýusyndan sargyt edip bolmaýar. Serwere birigiň.',
      'В демо меню нельзя оформить заказ. Подключитесь к серверу.',
      'Orders are unavailable in the sample menu. Connect to the server.',
    ],
    'Sunucuya bağlanılamadı. API adresini ve sunucuyu kontrol edin.': [
      'Serwere birigip bolmady. API salgysyny we serweri barlaň.',
      'Не удалось подключиться к серверу. Проверьте адрес API и сервер.',
      'Could not connect to the server. Check the API address and server.',
    ],
    'Bu sepet yalnızca tasarım önizlemesidir.': [
      'Bu sebet diňe görnüş synagydyr.',
      'Эта корзина только для просмотра дизайна.',
      'This cart is a design preview only.',
    ],
    'Ürünler toplamı': ['Önümleriň jemi', 'Сумма товаров', 'Items subtotal'],
    'Teslimat': ['Eltip bermek', 'Доставка', 'Delivery'],
    'Ödeme adımında': ['Töleg ädiminde', 'При оплате', 'At checkout'],
    'Sipariş ver': ['Sargyt et', 'Заказать', 'Order now'],
    'Sepeti temizle': ['Sebedi arassala', 'Очистить корзину', 'Clear cart'],
    'Sepeti temizleyelim mi?': [
      'Sebedi arassalamalymy?',
      'Очистить корзину?',
      'Clear your cart?',
    ],
    'Sepetiniz henüz boş': [
      'Sebediňiz entek boş',
      'Ваша корзина пуста',
      'Your cart is empty',
    ],
    'İlk lezzeti seçtiğinizde\nsepetiniz burada görünecek.': [
      'Ilkinji tagamy saýlanyňyzda\nsebediňiz şu ýerde görkeziler.',
      'Выберите первое блюдо —\nи оно появится здесь.',
      'Choose your first dish\nand it will appear here.',
    ],
    'Azalt': ['Azalt', 'Уменьшить', 'Decrease'],
    'Artır': ['Köpelt', 'Увеличить', 'Increase'],
    'Siparişi tamamla': ['Sargydy tamamla', 'Оформить заказ', 'Complete order'],
    'Teslimat konumunu seç': [
      'Eltip beriş ýerini saýla',
      'Выбрать адрес доставки',
      'Choose delivery location',
    ],
    'Haritada konum bul veya adres ara': [
      'Kartada ýer tap ýa-da salgy gözle',
      'Найдите точку на карте или введите адрес',
      'Find a place on the map or search an address',
    ],
    'Promosyon kodu (isteğe bağlı)': [
      'Arzanladyş kody (islege görä)',
      'Промокод (необязательно)',
      'Promo code (optional)',
    ],
    'Ürünler': ['Önümler', 'Товары', 'Items'],
    'İndirim': ['Arzanladyş', 'Скидка', 'Discount'],
    'Toplam': ['Jemi', 'Итого', 'Total'],
    'Bekleyin…': ['Garaşyň…', 'Подождите…', 'Please wait…'],
    'Güncel tutarı hesapla': [
      'Jemleýji bahany hasapla',
      'Рассчитать итог',
      'Calculate total',
    ],
    'Siparişi onayla': [
      'Sargydy tassykla',
      'Подтвердить заказ',
      'Confirm order',
    ],

    // Delivery map.
    'Teslimat konumu': [
      'Eltip beriş ýeri',
      'Адрес доставки',
      'Delivery location',
    ],
    'Pini taşıyın veya adres arayın. Gerekirse adresi düzenleyin.': [
      'Belligi süýşüriň ýa-da salgy gözläň. Zerur bolsa salgyny üýtgediň.',
      'Переместите метку или найдите адрес. При необходимости уточните его.',
      'Move the pin or search an address. Edit it if needed.',
    ],
    'Adres veya yer ara': [
      'Salgy ýa-da ýer gözle',
      'Найти адрес или место',
      'Search address or place',
    ],
    'Açık adres': ['Doly salgy', 'Полный адрес', 'Full address'],
    'Bu konumu kullan': [
      'Şu ýeri ulan',
      'Использовать это место',
      'Use this location',
    ],
    'Konum bulunamadı. Haritada pini taşıyarak adres seçebilirsiniz.': [
      'Ýerleşýän ýeriňiz tapylmady. Kartadaky belligi süýşürip salgy saýlaň.',
      'Не удалось определить местоположение. Выберите адрес, переместив метку.',
      'Location unavailable. Move the pin to choose an address.',
    ],
    'Konum yaklaşık bulundu. Teslimat noktasını haritada kontrol edin.': [
      'Ýer takmynan tapyldy. Eltip beriş ýerini kartada barlaň.',
      'Местоположение приблизительное. Проверьте точку доставки на карте.',
      'Location is approximate. Check the delivery point on the map.',
    ],
    'Aramak için en az 3 karakter yazın.': [
      'Gözlemek üçin azyndan 3 harp ýazyň.',
      'Введите минимум 3 символа для поиска.',
      'Enter at least 3 characters to search.',
    ],
    'Bu adrese uygun yer bulunamadı.': [
      'Bu salgy boýunça ýer tapylmady.',
      'По этому адресу ничего не найдено.',
      'No place found for this address.',
    ],
    'Adres araması şu anda kullanılamıyor.': [
      'Salgy gözlegi häzir elýeterli däl.',
      'Поиск адреса сейчас недоступен.',
      'Address search is unavailable right now.',
    ],

    // Orders and tracking.
    'Sipariş geçmişi çevrimdışı': [
      'Sargyt taryhy internet ýok wagty elýeterli däl',
      'История заказов недоступна офлайн',
      'Order history is offline',
    ],
    'Gerçek siparişlerinizi görmek için sunucuya bağlanın.': [
      'Hakyky sargytlaryňyzy görmek üçin serwere birigiň.',
      'Подключитесь к серверу, чтобы увидеть заказы.',
      'Connect to the server to see your orders.',
    ],
    'Siparişlerinizi görün': [
      'Sargytlaryňyzy görüň',
      'Посмотрите свои заказы',
      'See your orders',
    ],
    'Geçmiş siparişleriniz hesabınıza giriş yaptıktan sonra burada görünür.': [
      'Girenňizden soň öňki sargytlaryňyz şu ýerde görkeziler.',
      'Войдите в аккаунт, чтобы увидеть историю заказов.',
      'Sign in to see your order history here.',
    ],
    'Giriş yap': ['Giriş', 'Войти', 'Sign in'],
    'Siparişler yüklenemedi': [
      'Sargytlary ýükläp bolmady',
      'Не удалось загрузить заказы',
      'Could not load orders',
    ],
    'Bağlantınızı kontrol edip tekrar deneyin.': [
      'Baglanyşygyňyzy barlap gaýtadan synanyşyň.',
      'Проверьте соединение и попробуйте снова.',
      'Check your connection and try again.',
    ],
    'Henüz sipariş yok': [
      'Entek sargyt ýok',
      'Заказов пока нет',
      'No orders yet',
    ],
    'İlk siparişiniz ve durum güncellemeleri burada görünecek.': [
      'Ilkinji sargydyňyz we onuň ýagdaýy şu ýerde görkeziler.',
      'Первый заказ и обновления его статуса появятся здесь.',
      'Your first order and status updates will appear here.',
    ],
    'Tüm siparişler': ['Ähli sargytlar', 'Все заказы', 'All orders'],
    'Her lezzetin yolculuğu burada': [
      'Her tagamyň ýoly şu ýerde',
      'История каждого заказа здесь',
      'Every order journey starts here',
    ],
    'SİPARİŞ GEÇMİŞİNİZ': [
      'SARGYT TARYHYŇYZ',
      'ИСТОРИЯ ЗАКАЗОВ',
      'YOUR ORDER HISTORY',
    ],
    'Toplam tutar': ['Jemi baha', 'Итоговая сумма', 'Total amount'],
    'Haritada takip et': [
      'Kartada yzarla',
      'Отследить на карте',
      'Track on map',
    ],
    'Hazırlanıyor': ['Taýýarlanýar', 'Готовится', 'Preparing'],
    'Hazır': ['Taýýar', 'Готов', 'Ready'],
    'Kurye atandı': ['Kurýer bellendi', 'Курьер назначен', 'Courier assigned'],
    'Yolda': ['Ýolda', 'В пути', 'On the way'],
    'Teslim edildi': ['Eltip berildi', 'Доставлен', 'Delivered'],
    'İptal edildi': ['Ýatyryldy', 'Отменён', 'Cancelled'],
    'Durum yok': ['Ýagdaý ýok', 'Статус неизвестен', 'No status'],
    'Tarih bilgisi yok': ['Senesi ýok', 'Дата недоступна', 'Date unavailable'],
    'Takip bilgileri yenilenemedi': [
      'Yzarlama maglumatlary täzelenmedi',
      'Не удалось обновить отслеживание',
      'Could not refresh tracking',
    ],
    'Teslimat süresi hesaplanıyor': [
      'Eltip beriş wagty hasaplanýar',
      'Рассчитываем время доставки',
      'Calculating delivery time',
    ],
    'Sipariş teslim edildi': [
      'Sargyt eltip berildi',
      'Заказ доставлен',
      'Order delivered',
    ],
    'Siparişiniz hazırlanıyor': [
      'Sargydyňyz taýýarlanýar',
      'Ваш заказ готовится',
      'Your order is being prepared',
    ],
    'Kurye konumu bekleniyor': [
      'Kurýeriň ýerleşýän ýerine garaşylýar',
      'Ожидаем геопозицию курьера',
      'Waiting for courier location',
    ],
    'Kurye yolda · yol rotası bekleniyor': [
      'Kurýer ýolda · ugra garaşylýar',
      'Курьер в пути · ожидаем маршрут',
      'Courier on the way · waiting for route',
    ],
    'Siparişiniz size doğru yola çıktı': [
      'Sargydyňyz size tarap ýola çykdy',
      'Ваш заказ направляется к вам',
      'Your order is on its way',
    ],
    'Kurye atanmayı bekliyor': [
      'Kurýer bellenmegine garaşylýar',
      'Ожидаем назначения курьера',
      'Waiting for a courier',
    ],
    'Sipariş alındı': ['Sargyt kabul edildi', 'Заказ принят', 'Order received'],

    // Login and profile.
    'Saçakly’ye hoş geldiniz': [
      'Saçakly-a hoş geldiňiz',
      'Добро пожаловать в Saçakly',
      'Welcome to Saçakly',
    ],
    'Telefon numaranızla devam edin': [
      'Telefon belgiňiz bilen dowam ediň',
      'Продолжите по номеру телефона',
      'Continue with your phone number',
    ],
    'Telefonunuza gönderilen SMS kodunu girin': [
      'Telefon belgiňize iberilen SMS koduny giriziň',
      'Введите SMS-код, отправленный на ваш телефон',
      'Enter the SMS code sent to your phone',
    ],
    'Telefon (+993...)': [
      'Telefon (+993...)',
      'Телефон (+993...)',
      'Phone (+993...)',
    ],
    'SMS kodu': ['SMS kody', 'Код из SMS', 'SMS code'],
    'Örnek menüde SMS girişi kapalı. Sunucuyu başlatıp yenileyin.': [
      'Synag menýusynda SMS girişi ýapyk. Serweri işlediň we täzeläň.',
      'В демо меню вход по SMS недоступен. Запустите сервер и обновите.',
      'SMS sign-in is unavailable in sample mode. Start the server and refresh.',
    ],
    'Kodu doğrula': ['Kody tassykla', 'Подтвердить код', 'Verify code'],
    'Kod gönder': ['Kod iber', 'Отправить код', 'Send code'],
    'Kodu yeniden gönder': [
      'Kody täzeden iber',
      'Отправить код повторно',
      'Resend code',
    ],
    'Bağlantı açılamadı.': [
      'Baglanyşygy açyp bolmady.',
      'Не удалось открыть ссылку.',
      'Could not open the link.',
    ],
    'Kafelerden sevdiğin lezzetleri kolayca keşfet.': [
      'Kafelerde halaýan tagamlaryňy aňsatlyk bilen tap.',
      'Легко находите любимые блюда в кафе.',
      'Discover your favorite dishes from cafes.',
    ],
    'Hesabım': ['Hasabym', 'Мой аккаунт', 'My account'],
    'Hesap bilgileri': [
      'Hasap maglumatlary',
      'Данные аккаунта',
      'Account details',
    ],
    'Genel': ['Umumy', 'Основное', 'General'],
    'Haritada konum ara': [
      'Kartada ýer gözle',
      'Найти место на карте',
      'Find a place on the map',
    ],
    'Diğer': ['Beýlekiler', 'Другое', 'Other'],
    'Uygulama hakkında': ['Programma barada', 'О приложении', 'About the app'],
    'Kapat': ['Ýap', 'Закрыть', 'Close'],
    'Kullanım koşulları': [
      'Ulanyş şertleri',
      'Условия использования',
      'Terms of use',
    ],
    'Gizlilik politikası': [
      'Gizlinlik syýasaty',
      'Политика конфиденциальности',
      'Privacy policy',
    ],
    'Bize ulaşın': ['Biz bilen habarlaşyň', 'Связаться с нами', 'Contact us'],
    'Telefon': ['Telefon', 'Телефон', 'Phone'],
    'E-posta': ['E-poçta', 'Эл. почта', 'Email'],
    'Hesap': ['Hasap', 'Аккаунт', 'Account'],
    'Çıkış yap': ['Çyk', 'Выйти', 'Sign out'],
    'Sürüm 1.0.0': ['Wersiýa 1.0.0', 'Версия 1.0.0', 'Version 1.0.0'],
    'Misafir hesap': ['Myhman hasaby', 'Гостевой профиль', 'Guest account'],
    'Siparişlerini takip et.': [
      'Sargytlaryňy yzarla.',
      'Отслеживайте свои заказы.',
      'Track your orders.',
    ],
    'Siparişlerini takip etmek ve hesabına erişmek için giriş yap.': [
      'Sargytlaryňy yzarlamak we hasabyňa girmek üçin ulgama gir.',
      'Войдите, чтобы отслеживать заказы и открыть аккаунт.',
      'Sign in to track orders and access your account.',
    ],
    'Bir sorunuz mu var?': [
      'Soragyňyz barmy?',
      'Есть вопросы?',
      'Have a question?',
    ],
    'Örnek menü açık. Hesap işlemleri için sunucuya bağlanın.': [
      'Synag menýusy açyk. Hasap amallary üçin serwere birigiň.',
      'Открыто демо меню. Для работы с аккаунтом подключитесь к серверу.',
      'Sample menu is open. Connect to the server for account actions.',
    ],
    'Dil': ['Dil', 'Язык', 'Language'],
    'Dil seçin': ['Dili saýlaň', 'Выберите язык', 'Choose language'],
    'Uygulama dilini seçin': [
      'Programma dilini saýlaň',
      'Выберите язык приложения',
      'Choose the app language',
    ],
    'Dili uygula': ['Dili ulan', 'Применить язык', 'Apply language'],
    'Ayarlar': ['Sazlamalar', 'Настройки', 'Settings'],
    'Tema seçimi': ['Tema saýlawy', 'Выбор темы', 'Theme selection'],
    'Tema': ['Tema', 'Тема', 'Theme'],
    'Açık': ['Ýagty', 'Светлая', 'Light'],
    'Koyu': ['Garaňky', 'Тёмная', 'Dark'],
    'Açık tema': ['Ýagty tema', 'Светлая тема', 'Light theme'],
    'Koyu tema': ['Garaňky tema', 'Тёмная тема', 'Dark theme'],
    'Temizle': ['Arassala', 'Очистить', 'Clear'],
    'Boş alışveriş sepeti': ['Boş sebet', 'Пустая корзина', 'Empty cart'],
  };
}

class _Pattern {
  const _Pattern(this.pattern, this.format);
  final RegExp pattern;
  final String Function(RegExpMatch, int) format;
}
