class CartLine {
  CartLine(this.product, this.variant, this.quantity);
  final Map<String, dynamic> product;
  final Map<String, dynamic>? variant;
  int quantity;
  String get key => '${product['id']}:${variant?['id'] ?? ''}';
  String get name => variant == null
      ? product['name'].toString()
      : '${product['name']} · ${variant!['name']}';
  double get price =>
      ((variant?['price'] ?? product['price']) as num).toDouble();
  Map<String, dynamic> toRequest() => {
    'productId': product['id'],
    if (variant != null) 'variantId': variant!['id'],
    'quantity': quantity,
  };
}
