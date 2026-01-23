const LS_KEY = "hotel_rate_compare_rooms_v5_compact_hotelrow";
const $ = (id) => document.getElementById(id);

const state = {
  hotels: [],
  hidden: new Set(),
  editingHotelId: null,
  tempRooms: [],
  modal: { mode:null, hotelId:null, roomId:null, idx:0 },
  tempModalPhotos: null
};

function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function load(){
  try { state.hotels = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { state.hotels = []; }
}
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state.hotels)); }

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function fmtMoney(n){
  const x = Number(n || 0);
  return x.toLocaleString("en-LK");
}

function fileToCompressedDataURL(file, maxW = 1000, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function hotelStats(h){
  const rooms = h.rooms || [];
  const minPrice = rooms.length ? Math.min(...rooms.map(r => Number(r.price || 0))) : 0;
  const minHours = rooms.length ? Math.min(...rooms.map(r => Number(r.hours || 0))) : 0;
  return { minPrice, minHours, roomCount: rooms.length };
}

function roomsShown(hotelId){
  return !state.hidden.has(hotelId);
}

// ---------- Temp rooms ----------
function updateRoomCount(){
  $("roomCountPill").textContent = "🛏️ " + state.tempRooms.length;
}

function clearRoomCard(){
  $("roomType").value = "";
  $("roomHours").value = "";
  $("roomPrice").value = "";
  $("roomNote").value = "";
  $("roomPhotos").value = "";
}

async function addRoomToTemp(){
  const type = $("roomType").value.trim();
  const hours = parseFloat($("roomHours").value);
  const price = parseFloat($("roomPrice").value);
  const note = $("roomNote").value.trim();
  const files = Array.from($("roomPhotos").files || []);

  if (!type) return alert("Please enter Room type name.");
  if (!Number.isFinite(hours) || hours <= 0) return alert("Please enter valid hours.");
  if (!Number.isFinite(price) || price < 0) return alert("Please enter valid price.");

  let photos = [];
  if (files.length){
    try {
      for (const f of files) photos.push(await fileToCompressedDataURL(f));
    } catch(e){
      console.error(e);
      alert("Some photos couldn't be processed. Try smaller images.");
    }
  }

  state.tempRooms.push({ id: uid(), type, hours, price, note, photos });
  renderTempRooms();
  clearRoomCard();
}

function renderTempRooms(){
  const box = $("tempRooms");
  box.innerHTML = "";
  updateRoomCount();

  if (!state.tempRooms.length){
    box.innerHTML = `<div class="mini" style="margin-top:8px">No rooms added yet.</div>`;
    return;
  }

  state.tempRooms.forEach((r, idx) => {
    const div = document.createElement("div");
    div.className = "roomItem";
    const pCount = (r.photos?.length || 0);

    div.innerHTML = `
      <div class="roomHead">
        <b>${idx+1}. ${escapeHtml(r.type)}</b>
        <div class="actions">
          <button class="linkbtn" type="button" data-view-temp="${r.id}">View Photos</button>
          <button class="linkbtn" type="button" data-edit-temp="${r.id}">Edit</button>
          <button class="linkbtn danger" type="button" data-del-temp="${r.id}">Remove</button>
        </div>
      </div>
      <div class="roomMeta">
        <span class="pill">⏱️ ${escapeHtml(r.hours)} hrs</span>
        <span class="pill">💰 ${fmtMoney(r.price)} LKR</span>
        <span class="pill">🖼️ ${pCount}</span>
      </div>
      ${r.note ? `<div class="mini" style="margin-top:6px">${escapeHtml(r.note)}</div>` : ""}
      <div class="tinyThumbs" data-prev="${r.id}"></div>
    `;

    box.appendChild(div);

    const prev = div.querySelector(`[data-prev="${r.id}"]`);
    (r.photos || []).slice(0,6).forEach(ph => {
      const t = document.createElement("div");
      t.className = "tinyThumb";
      t.innerHTML = `<img src="${ph}" alt="preview">`;
      prev.appendChild(t);
    });
  });

  box.querySelectorAll("[data-del-temp]").forEach(b => b.addEventListener("click", () => {
    state.tempRooms = state.tempRooms.filter(x => x.id !== b.dataset.delTemp);
    renderTempRooms();
  }));

  box.querySelectorAll("[data-view-temp]").forEach(b => b.addEventListener("click", () => {
    const room = state.tempRooms.find(x => x.id === b.dataset.viewTemp);
    if (!room || !room.photos || !room.photos.length) return alert("No photos for this room.");
    openTempModal(($("hotelName").value.trim() || "Hotel"), room.type, room.photos, 0);
  }));

  box.querySelectorAll("[data-edit-temp]").forEach(b => b.addEventListener("click", () => {
    const room = state.tempRooms.find(x => x.id === b.dataset.editTemp);
    if (!room) return;

    $("roomType").value = room.type;
    $("roomHours").value = room.hours;
    $("roomPrice").value = room.price;
    $("roomNote").value = room.note || "";
    $("roomPhotos").value = "";

    state.tempRooms = state.tempRooms.filter(x => x.id !== room.id);
    renderTempRooms();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}

function clearAllForm(){
  state.editingHotelId = null;
  $("hotelName").value = "";
  clearRoomCard();
  state.tempRooms = [];
  $("saveHotelBtn").textContent = "Save Hotel to List";
  renderTempRooms();
}

// ---------- Save / Edit / Delete ----------
function saveHotelToList(){
  const name = $("hotelName").value.trim();
  if (!name) return alert("Please enter Hotel / Location name.");
  if (!state.tempRooms.length) return alert("Please add at least one room before saving the hotel.");

  if (state.editingHotelId){
    const idx = state.hotels.findIndex(h => h.id === state.editingHotelId);
    if (idx >= 0){
      state.hotels[idx] = { ...state.hotels[idx], name, rooms: state.tempRooms };
    }
  } else {
    state.hotels.push({ id: uid(), name, rooms: state.tempRooms, createdAt: Date.now() });
  }

  save();
  clearAllForm();
  renderTable();
}

function editHotel(id){
  const h = state.hotels.find(x => x.id === id);
  if (!h) return;
  state.editingHotelId = id;
  $("hotelName").value = h.name;
  state.tempRooms = (h.rooms || []).map(r => ({...r}));
  $("saveHotelBtn").textContent = "Update Hotel in List";
  renderTempRooms();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteHotel(id){
  const h = state.hotels.find(x => x.id === id);
  if (!h) return;
  if (!confirm(`Delete "${h.name}" and all rooms?`)) return;
  state.hotels = state.hotels.filter(x => x.id !== id);
  state.hidden.delete(id);
  save();
  renderTable();
  if (state.editingHotelId === id) clearAllForm();
}

function deleteSavedRoom(key){
  const [hid, rid] = key.split("::");
  const h = state.hotels.find(x => x.id === hid);
  if (!h) return;
  const r = (h.rooms||[]).find(x => x.id === rid);
  if (!r) return;
  if (!confirm(`Delete room "${r.type}" from "${h.name}"?`)) return;

  h.rooms = (h.rooms||[]).filter(x => x.id !== rid);
  if (!h.rooms.length){
    alert("Hotel has no rooms now, so hotel will be removed too.");
    state.hotels = state.hotels.filter(x => x.id !== hid);
    state.hidden.delete(hid);
  }
  save();
  renderTable();

  if (state.editingHotelId === hid) editHotel(hid);
}

// ---------- Search / Sort ----------
function getFilteredSortedHotels(){
  const q = $("search").value.trim().toLowerCase();
  let arr = state.hotels.filter(h => {
    if (h.name.toLowerCase().includes(q)) return true;
    return (h.rooms || []).some(r =>
      (r.type || "").toLowerCase().includes(q) ||
      (r.note || "").toLowerCase().includes(q)
    );
  });

  const sortBy = $("sortBy").value;
  arr.sort((a,b) => {
    const A = hotelStats(a), B = hotelStats(b);
    if (sortBy === "createdDesc") return (b.createdAt||0) - (a.createdAt||0);
    if (sortBy === "minPriceAsc") return A.minPrice - B.minPrice;
    if (sortBy === "minPriceDesc") return B.minPrice - A.minPrice;
    if (sortBy === "minHoursAsc") return A.minHours - B.minHours;
    if (sortBy === "minHoursDesc") return B.minHours - A.minHours;
    return 0;
  });

  return arr;
}

// ---------- Table render ----------
function renderTable(){
  const tbody = $("tbody");
  tbody.innerHTML = "";

  const hotels = getFilteredSortedHotels();
  if (!hotels.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="muted">No hotels yet. Add a hotel and rooms, then save.</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const h of hotels){
    const st = hotelStats(h);
    const shown = roomsShown(h.id);

    const tr = document.createElement("tr");
    tr.className = "hotelRow";
    tr.innerHTML = `
      <td colspan="6">
        <div class="hotelRowBar">
          <div class="hotelTitle">
            <div class="name">${escapeHtml(h.name)}</div>
          </div>
          <div class="actions hotelActions">
            <button class="linkbtn iconbtn" type="button" title="${shown ? "Hide rooms" : "Show rooms"}" aria-label="${shown ? "Hide rooms" : "Show rooms"}" data-toggle="${h.id}">${shown ? "🙈" : "👁️"}</button>
            <button class="linkbtn iconbtn" type="button" title="Edit" aria-label="Edit" data-edit="${h.id}">✏️</button>
            <button class="linkbtn danger iconbtn" type="button" title="Delete" aria-label="Delete" data-del="${h.id}">🗑️</button>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    if (shown){
      for (const r of (h.rooms || [])){
        const rHasPhotos = r.photos && r.photos.length;
        const thumbHtml = rHasPhotos
          ? `<button class="thumbBtn" type="button" title="View photos" aria-label="View photos" data-view-room="${h.id}::${r.id}">
               <span class="thumb"><img src="${r.photos[0]}" alt="Room photo"></span>
             </button>`
          : `<span class="thumb" title="No photos" aria-label="No photos">📷</span>`;

        // Mobile-friendly room row: first line = type/hours/price/icons, second line = note
        const sub = document.createElement("tr");
        sub.className = "subRow";
        sub.innerHTML = `
          <td colspan="6">
            <div class="roomCompact">
              <div class="roomCompactTop">
                <div class="roomCompactLeft">
                  ${thumbHtml}
                  <div class="roomCompactType"><span class="roomArrow">↳</span>${escapeHtml(r.type)}</div>
                </div>
                <div class="roomCompactMid">
                  <div class="roomCompactCell" title="Hours"><span class="roomIco">⏱️</span><span class="roomVal">${escapeHtml(r.hours)}</span></div>
                  <div class="roomCompactCell" title="Price (LKR)"><span class="roomIco">💰</span><span class="roomVal"><b>${fmtMoney(r.price)}</b></span></div>
                </div>
                <div class="roomCompactActions">
                  <button class="linkbtn iconbtn" type="button" title="View photos" aria-label="View photos" ${rHasPhotos ? `data-view-room="${h.id}::${r.id}"` : "disabled"}>
                    🖼️
                  </button>
                  <button class="linkbtn danger iconbtn" type="button" title="Delete room" aria-label="Delete room" data-del-room="${h.id}::${r.id}">🗑️</button>
                </div>
              </div>
              ${r.note ? `<div class="roomCompactNote">${escapeHtml(r.note)}</div>` : ""}
            </div>
          </td>
        `;
        tbody.appendChild(sub);
      }
    }
  }

  tbody.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.toggle;
    if (state.hidden.has(id)) state.hidden.delete(id);
    else state.hidden.add(id);
    renderTable();
  }));
  tbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editHotel(b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => deleteHotel(b.dataset.del)));
  tbody.querySelectorAll("[data-del-room]").forEach(b => b.addEventListener("click", () => deleteSavedRoom(b.dataset.delRoom)));

  tbody.querySelectorAll("[data-view-room]").forEach(b => b.addEventListener("click", () => {
    const [hid, rid] = b.dataset.viewRoom.split("::");
    openSavedRoomModal(hid, rid, 0);
  }));
}

// ---------- Modal ----------
function openSavedRoomModal(hotelId, roomId, startIdx){
  const h = state.hotels.find(x => x.id === hotelId);
  if (!h) return;
  const r = (h.rooms||[]).find(x => x.id === roomId);
  if (!r || !r.photos || !r.photos.length) return alert("No photos for this room.");

  state.modal.mode = "saved";
  state.modal.hotelId = hotelId;
  state.modal.roomId = roomId;
  state.modal.idx = startIdx;
  $("modalTitle").textContent = `${h.name} — ${r.type}`;
  $("modal").classList.add("show");
  showModalImage();
}

function openTempModal(hotelName, roomType, photos, startIdx){
  state.tempModalPhotos = photos;
  state.modal.mode = "temp";
  state.modal.hotelId = null;
  state.modal.roomId = null;
  state.modal.idx = startIdx;
  $("modalTitle").textContent = `${hotelName} — ${roomType}`;
  $("modal").classList.add("show");
  showModalImage();
}

function showModalImage(){
  let photos = [];
  if (state.modal.mode === "temp"){
    photos = state.tempModalPhotos || [];
  } else {
    const h = state.hotels.find(x => x.id === state.modal.hotelId);
    const r = (h?.rooms||[]).find(x => x.id === state.modal.roomId);
    photos = r?.photos || [];
  }

  if (!photos.length) return;
  const total = photos.length;
  const i = ((state.modal.idx % total) + total) % total;
  state.modal.idx = i;

  $("viewImg").src = photos[i];
  $("caption").textContent = `Photo ${i+1} of ${total}`;
  $("prevBtn").style.display = total > 1 ? "block" : "none";
  $("nextBtn").style.display = total > 1 ? "block" : "none";
}

function closeModal(){
  $("modal").classList.remove("show");
  $("viewImg").src = "";
  $("caption").textContent = "";
  state.tempModalPhotos = null;
  state.modal = { mode:null, hotelId:null, roomId:null, idx:0 };
}

$("closeModal").addEventListener("click", closeModal);
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
$("prevBtn").addEventListener("click", () => { state.modal.idx--; showModalImage(); });
$("nextBtn").addEventListener("click", () => { state.modal.idx++; showModalImage(); });

let touchX = null;
$("viewer").addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, {passive:true});
$("viewer").addEventListener("touchend", (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) < 35) return;
  if (dx < 0) state.modal.idx++;
  else state.modal.idx--;
  showModalImage();
}, {passive:true});

// ---------- Export / Import / wipe ----------
$("dataActions").addEventListener("change", async () => {
  const v = $("dataActions").value;
  $("dataActions").value = "";

  if (v === "export") {
    const blob = new Blob([JSON.stringify(state.hotels, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hotel_rooms_export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (v === "import") $("importFile").click();

  if (v === "wipe") {
    if (!confirm("This will delete ALL saved hotels on this device. Continue?")) return;
    state.hotels = [];
    state.hidden = new Set();
    save();
    renderTable();
    clearAllForm();
  }
});

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("Invalid JSON");

    for (const h of imported){
      if (!h.id) h.id = uid();
      if (!h.createdAt) h.createdAt = Date.now();
      if (!Array.isArray(h.rooms)) h.rooms = [];
      for (const r of h.rooms){
        if (!r.id) r.id = uid();
        if (!Array.isArray(r.photos)) r.photos = [];
      }
      if (!h.name) h.name = "Unnamed Hotel";
      if (!h.rooms.length) h.rooms.push({ id: uid(), type:"Room", hours:1, price:0, note:"", photos:[] });
    }

    state.hotels = imported;
    save();
    renderTable();
    alert("Imported successfully!");
  } catch (err) {
    console.error(err);
    alert("Import failed. Please select a valid export JSON file.");
  }
});

// ---------- Bindings ----------
$("addRoomBtn").addEventListener("click", addRoomToTemp);
$("clearRoomBtn").addEventListener("click", clearRoomCard);
$("saveHotelBtn").addEventListener("click", saveHotelToList);
$("clearAllBtn").addEventListener("click", () => {
  if (confirm("Clear hotel name + temporary rooms?")) clearAllForm();
});

$("search").addEventListener("input", renderTable);
$("sortBy").addEventListener("change", renderTable);

// init
load();
renderTempRooms();
renderTable();
