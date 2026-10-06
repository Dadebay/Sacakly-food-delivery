import { useEffect, useState, type FormEvent } from "react";
import { api, type CafeBranch, type CafeCatalog, type CafeProduct } from "../api/client";

type ProductEdit = { id: string; version: number; categoryId: string; name: string; description: string; price: string; preparationMinutes: string; loyaltyPoints: string };
type BranchEdit = { id: string; version: number; name: string; address: string; latitude: string; longitude: string };

export function CatalogManager({ cafeId }: { cafeId: string }) {
  const [catalog, setCatalog] = useState<CafeCatalog | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [editCategory, setEditCategory] = useState<{ id: string; version: number; name: string } | null>(null);
  const [productCategoryId, setProductCategoryId] = useState("");
  const [productName, setProductName] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [price, setPrice] = useState("");
  const [preparationMinutes, setPreparationMinutes] = useState("20");
  const [loyaltyPoints, setLoyaltyPoints] = useState("0");
  const [editProduct, setEditProduct] = useState<ProductEdit | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [editBranch, setEditBranch] = useState<BranchEdit | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.cafeCatalog(cafeId).then((data) => { if (active) { setCatalog(data); setProductCategoryId((current) => current || data.categories[0]?.id || ""); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить меню"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cafeId, revision]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); setRevision((value) => value + 1); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить. Обновите данные и повторите."); return false; }
    finally { setBusy(false); }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await mutate(() => api.createCafeCategory(cafeId, { name: categoryName, slug: categorySlug }), "Категория создана")) {
      setCategoryName(""); setCategorySlug("");
    }
  }
  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await mutate(() => api.createCafeProduct(cafeId, { categoryId: productCategoryId, name: productName, slug: productSlug, description: productDescription, price: Number(price), preparationMinutes: Number(preparationMinutes), loyaltyPoints: Number(loyaltyPoints) }), "Блюдо добавлено")) {
      setProductName(""); setProductSlug(""); setProductDescription(""); setPrice(""); setLoyaltyPoints("0");
    }
  }
  async function addBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await mutate(() => api.createCafeBranch(cafeId, { name: branchName, address: branchAddress, latitude: Number(latitude), longitude: Number(longitude) }), "Филиал добавлен")) {
      setBranchName(""); setBranchAddress(""); setLatitude(""); setLongitude("");
    }
  }
  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editProduct) return;
    if (await mutate(() => api.updateCafeProduct(cafeId, editProduct.id, { expectedVersion: editProduct.version, categoryId: editProduct.categoryId, name: editProduct.name, description: editProduct.description, price: Number(editProduct.price), preparationMinutes: Number(editProduct.preparationMinutes), loyaltyPoints: Number(editProduct.loyaltyPoints) }), "Блюдо обновлено")) setEditProduct(null);
  }
  async function saveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editBranch) return;
    if (await mutate(() => api.updateCafeBranch(cafeId, editBranch.id, { expectedVersion: editBranch.version, name: editBranch.name, address: editBranch.address, latitude: Number(editBranch.latitude), longitude: Number(editBranch.longitude) }), "Филиал обновлён")) setEditBranch(null);
  }
  function openProduct(product: CafeProduct) { setEditProduct({ id: product.id, version: product.version, categoryId: product.categoryId, name: product.name, description: product.description, price: product.price, preparationMinutes: String(product.preparationMinutes), loyaltyPoints: String(product.loyaltyPoints) }); }
  function openBranch(branch: CafeBranch) { setEditBranch({ id: branch.id, version: branch.version, name: branch.name, address: branch.address, latitude: branch.latitude, longitude: branch.longitude }); }

  return <div className="catalog-manager" data-testid="merchant-catalog-root">
    <div className="catalog-heading"><div><h3>Меню и филиалы</h3><p>Изменения видны только в выбранном кафе. Цена заказа всегда пересчитывается сервером.</p></div><button className="outline-button" onClick={() => setRevision((value) => value + 1)} disabled={loading || busy}>Обновить</button></div>
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}
    {loading && <p role="status">Загружаем каталог…</p>}
    {catalog && <div className="catalog-grid">
      <section className="panel"><h3>Категории</h3><form className="catalog-form" data-testid="catalog-category-form" onSubmit={addCategory}>
        <label>Название<input required minLength={2} maxLength={100} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /></label>
        <label>Код URL (латиница)<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)} placeholder="osnovnye-blyuda" /></label>
        <button type="submit" disabled={busy}>Добавить категорию</button></form>
        <div className="catalog-list">{catalog.categories.map((category) => <article key={category.id} className="catalog-row"><div><strong>{category.name}</strong><small>{category.products.length} блюд · версия {category.version}</small></div><div className="catalog-actions"><button disabled={busy} onClick={() => setEditCategory({ id: category.id, version: category.version, name: category.name })}>Изменить</button><button disabled={busy} onClick={() => mutate(() => api.updateCafeCategory(cafeId, category.id, { expectedVersion: category.version, isActive: !category.isActive }), category.isActive ? "Категория скрыта" : "Категория опубликована")}>{category.isActive ? "Скрыть" : "Опубликовать"}</button></div>
          {editCategory?.id === category.id && <form className="catalog-inline" onSubmit={async (event) => { event.preventDefault(); if (await mutate(() => api.updateCafeCategory(cafeId, category.id, { expectedVersion: editCategory.version, name: editCategory.name }), "Категория обновлена")) setEditCategory(null); }}><label>Новое название<input required minLength={2} maxLength={100} value={editCategory.name} onChange={(event) => setEditCategory({ ...editCategory, name: event.target.value })} /></label><button disabled={busy}>Сохранить</button><button type="button" onClick={() => setEditCategory(null)}>Отмена</button></form>}
        </article>)}</div>
      </section>
      <section className="panel"><h3>Блюда</h3><form className="catalog-form" data-testid="catalog-product-form" onSubmit={addProduct}>
        <label>Категория<select data-testid="catalog-product-category" required value={productCategoryId} onChange={(event) => setProductCategoryId(event.target.value)}><option value="">Выберите</option>{catalog.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Название<input required minLength={2} maxLength={160} value={productName} onChange={(event) => setProductName(event.target.value)} /></label>
        <label>Код URL (латиница)<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={productSlug} onChange={(event) => setProductSlug(event.target.value)} placeholder="palow" /></label>
        <label>Описание<textarea maxLength={2000} value={productDescription} onChange={(event) => setProductDescription(event.target.value)} /></label>
        <div className="catalog-two"><label>Цена, TMT<input required type="number" min="0" max="999999.99" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label>Приготовление, минут<input required type="number" min="0" max="1440" step="1" value={preparationMinutes} onChange={(event) => setPreparationMinutes(event.target.value)} /></label></div>
        <label>Баллы за одну порцию после доставки<input data-testid="catalog-product-points" required type="number" min="0" max="1000000" step="1" value={loyaltyPoints} onChange={(event) => setLoyaltyPoints(event.target.value)} /></label><button type="submit" disabled={busy || !catalog.categories.length}>Добавить блюдо</button></form>
        <div className="catalog-list">{catalog.categories.flatMap((category) => category.products.map((product) => <article key={product.id} className="catalog-row"><div><strong>{product.name}</strong><small>{category.name} · {product.price} TMT · {product.preparationMinutes} мин. · {product.loyaltyPoints} баллов · v{product.version}</small></div><div className="catalog-actions"><button disabled={busy} onClick={() => openProduct(product)}>Изменить</button><button disabled={busy} onClick={() => mutate(() => api.updateCafeProduct(cafeId, product.id, { expectedVersion: product.version, isActive: !product.isActive }), product.isActive ? "Блюдо скрыто" : "Блюдо опубликовано")}>{product.isActive ? "Скрыть" : "Опубликовать"}</button></div>
          {editProduct?.id === product.id && <form className="catalog-inline" onSubmit={saveProduct}><label>Категория<select value={editProduct.categoryId} onChange={(event) => setEditProduct({ ...editProduct, categoryId: event.target.value })}>{catalog.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Название<input required minLength={2} value={editProduct.name} onChange={(event) => setEditProduct({ ...editProduct, name: event.target.value })} /></label><label>Описание<textarea value={editProduct.description} onChange={(event) => setEditProduct({ ...editProduct, description: event.target.value })} /></label><div className="catalog-two"><label>Цена<input required type="number" min="0" step="0.01" value={editProduct.price} onChange={(event) => setEditProduct({ ...editProduct, price: event.target.value })} /></label><label>Минуты<input required type="number" min="0" max="1440" step="1" value={editProduct.preparationMinutes} onChange={(event) => setEditProduct({ ...editProduct, preparationMinutes: event.target.value })} /></label></div><label>Баллы за порцию<input data-testid="catalog-edit-product-points" required type="number" min="0" max="1000000" step="1" value={editProduct.loyaltyPoints} onChange={(event) => setEditProduct({ ...editProduct, loyaltyPoints: event.target.value })} /></label><button disabled={busy}>Сохранить</button><button type="button" onClick={() => setEditProduct(null)}>Отмена</button></form>}
        </article>))}</div>
      </section>
      <section className="panel catalog-branches"><h3>Филиалы и кухни</h3><form className="catalog-form" data-testid="catalog-branch-form" onSubmit={addBranch}>
        <label>Название<input required minLength={2} maxLength={160} value={branchName} onChange={(event) => setBranchName(event.target.value)} /></label><label>Адрес<input required minLength={3} maxLength={500} value={branchAddress} onChange={(event) => setBranchAddress(event.target.value)} /></label>
        <div className="catalog-two"><label>Широта<input required type="number" min="-90" max="90" step="0.0000001" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label><label>Долгота<input required type="number" min="-180" max="180" step="0.0000001" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label></div>
        <button type="submit" disabled={busy}>Добавить филиал</button></form>
        <div className="catalog-list">{catalog.branches.map((branch) => <article key={branch.id} className="catalog-row"><div><strong>{branch.name}</strong><small>{branch.address} · v{branch.version}</small></div><div className="catalog-actions"><button disabled={busy} onClick={() => openBranch(branch)}>Изменить</button><button disabled={busy} onClick={() => mutate(() => api.updateCafeBranch(cafeId, branch.id, { expectedVersion: branch.version, isActive: !branch.isActive }), branch.isActive ? "Филиал закрыт" : "Филиал открыт")}>{branch.isActive ? "Закрыть" : "Открыть"}</button></div>
          {editBranch?.id === branch.id && <form className="catalog-inline" onSubmit={saveBranch}><label>Название<input required minLength={2} value={editBranch.name} onChange={(event) => setEditBranch({ ...editBranch, name: event.target.value })} /></label><label>Адрес<input required minLength={3} value={editBranch.address} onChange={(event) => setEditBranch({ ...editBranch, address: event.target.value })} /></label><div className="catalog-two"><label>Широта<input required type="number" min="-90" max="90" step="0.0000001" value={editBranch.latitude} onChange={(event) => setEditBranch({ ...editBranch, latitude: event.target.value })} /></label><label>Долгота<input required type="number" min="-180" max="180" step="0.0000001" value={editBranch.longitude} onChange={(event) => setEditBranch({ ...editBranch, longitude: event.target.value })} /></label></div><button disabled={busy}>Сохранить</button><button type="button" onClick={() => setEditBranch(null)}>Отмена</button></form>}
        </article>)}</div>
      </section>
    </div>}
  </div>;
}
