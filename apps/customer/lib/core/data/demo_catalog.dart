/// Read-only preview copied from the former Flutter app's bundled mock menu.
/// These IDs never reach checkout; the API remains the source of order data.
class DemoCatalog {
  const DemoCatalog._();

  static const cafes = <Map<String, dynamic>>[
    {
      'id': 'demo-han-tagam',
      'slug': 'han-tagam',
      'name': 'Han tagam',
      'description': 'Türkmen mutfağından geleneksel lezzetler',
      'cuisines': ['TURKMEN'],
      'imageUrl': 'asset://assets/onboard1.png',
    },
    {
      'id': 'demo-panda',
      'slug': 'panda',
      'name': 'Panda',
      'description': 'Günlük yemekler ve içecekler',
      'cuisines': ['FAST_FOOD'],
      'imageUrl': 'asset://assets/onboard2.png',
    },
  ];

  static const banners = <Map<String, dynamic>>[
    {
      'id': 'demo-banner-han',
      'title': 'Geleneksel lezzetler',
      'subtitle': 'Han tagam menüsünü keşfet',
      'imageUrl': 'asset://assets/onboard1.png',
      'link': 'app://cafe/demo-han-tagam',
    },
    {
      'id': 'demo-banner-panda',
      'title': 'Bugün ne yiyelim?',
      'subtitle': 'Panda menüsünü keşfet',
      'imageUrl': 'asset://assets/onboard2.png',
      'link': 'app://cafe/demo-panda',
    },
  ];

  static const _menu = <String, List<Map<String, dynamic>>>{
    'demo-han-tagam': [
      {
        'id': 'demo-plov',
        'name': 'Плов',
        'products': [
          {
            'id': 'demo-plov-ashgabat',
            'name': 'Плов по-ашхабадски',
            'description': 'Рис, баранина, морковь, айва.',
            'price': 45,
          },
          {
            'id': 'demo-plov-chicken',
            'name': 'Плов с курицей',
            'description': 'Рис, курица и зира.',
            'price': 38,
          },
          {
            'id': 'demo-lagman',
            'name': 'Лагман',
            'description': 'Лапша, говядина и овощи.',
            'price': 40,
          },
        ],
      },
      {
        'id': 'demo-shashlyk',
        'name': 'Шашлык',
        'products': [
          {
            'id': 'demo-shashlyk-beef',
            'name': 'Шашлык из говядины',
            'description': 'Говядина на углях с луком.',
            'price': 62,
          },
          {
            'id': 'demo-shashlyk-lamb',
            'name': 'Шашлык из баранины',
            'description': 'Баранина на углях.',
            'price': 68,
          },
        ],
      },
      {
        'id': 'demo-somsa',
        'name': 'Самса',
        'products': [
          {
            'id': 'demo-somsa-meat',
            'name': 'Мясная самса',
            'description': 'Слоёное тесто, баранина и лук.',
            'price': 32,
          },
        ],
      },
      {
        'id': 'demo-bread',
        'name': 'Выпечка',
        'products': [
          {
            'id': 'demo-churek',
            'name': 'Тандырный чурек',
            'description': 'Свежий горячий чурек.',
            'price': 9,
          },
          {
            'id': 'demo-byorek-meat',
            'name': 'Мясной бёрек',
            'description': 'Тонкое тесто с мясом.',
            'price': 15,
          },
        ],
      },
    ],
    'demo-panda': [
      {
        'id': 'demo-salads',
        'name': 'Салаты',
        'products': [
          {
            'id': 'demo-salad-merjen',
            'name': 'Салат «Мерджен»',
            'description': 'Овощи, зелень и лёгкая заправка.',
            'price': 24,
          },
          {
            'id': 'demo-dograma',
            'name': 'Дограма',
            'description': 'Чурек, мясо и лук на бульоне.',
            'price': 38,
          },
        ],
      },
      {
        'id': 'demo-drinks',
        'name': 'Напитки',
        'products': [
          {
            'id': 'demo-ayran',
            'name': 'Айран',
            'description': 'Холодный кисломолочный напиток.',
            'price': 5,
          },
          {
            'id': 'demo-tea-green',
            'name': 'Чай зелёный',
            'description': 'Горячий чайник на двоих.',
            'price': 9,
          },
          {
            'id': 'demo-compote',
            'name': 'Компот',
            'description': 'Домашний компот из сухофруктов.',
            'price': 8,
          },
        ],
      },
    ],
  };

  static List<Map<String, dynamic>> categoriesFor(String cafeId) =>
      _menu[cafeId] ?? [];
}
