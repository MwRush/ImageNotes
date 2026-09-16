const elements = Object.fromEntries(Array.from(document.querySelectorAll('[id]'), (element) => [element.id, element]));
const maximum_file_bytes = 30 * 1024 * 1024;
const maximum_image_pixels = 60000000;
const maximum_comments = 40;
let source_url = null;
let export_url = null;
let source_file = null;
let annotations = [];
let current_tool = 'point';
let draft = null;
let editing_id = null;
let selected_id = null;
let next_id = 1;
let pointer_start = null;
let pending_file = null;
let load_version = 0;
let is_exporting = false;
let drag_depth = 0;

function set_status(message, is_error = false) {
    elements.live_status.textContent = message;
    elements.live_status.classList.toggle('error', is_error);
    elements.live_status.classList.toggle('visually_hidden', !is_error);
}

function clamp(value, minimum = 0, maximum = 1) {
    return Math.max(minimum, Math.min(maximum, value));
}

function has_unsaved_text() {
    return Boolean(elements.comment_input.value.trim());
}

function update_controls() {
    const has_draft = Boolean(draft);
    elements.comment_input.disabled = !has_draft || is_exporting;
    elements.save_button.disabled = !has_draft || !has_unsaved_text() || is_exporting;
    elements.export_button.disabled = (!annotations.length && !has_unsaved_text()) || is_exporting;
    elements.replace_button.disabled = is_exporting;
    elements.point_button.disabled = is_exporting;
    elements.area_button.disabled = is_exporting;
    elements.cancel_button.disabled = is_exporting;
    elements.comment_popover.hidden = !has_draft || Boolean(pointer_start);
    elements.delete_draft_button.hidden = !editing_id;
    elements.composer_number.textContent = editing_id ? String(annotations.findIndex((item) => item.id === editing_id) + 1) : has_draft ? String(annotations.length + 1) : '+';
    elements.comment_label.textContent = editing_id ? 'Modifier' : 'Commentaire';
    elements.comment_count.textContent = String(annotations.length);
    elements.comments_section.hidden = !annotations.length;
    position_popover();
}

function position_popover() {
    if (!draft || elements.comment_popover.hidden) return;
    const viewport = window.visualViewport;
    const viewport_left = viewport?.offsetLeft || 0;
    const viewport_top = viewport?.offsetTop || 0;
    const viewport_width = viewport?.width || window.innerWidth;
    const viewport_height = viewport?.height || window.innerHeight;
    elements.comment_popover.style.maxHeight = `${Math.max(120, viewport_height - 24)}px`;
    const bounds = elements.image_surface.getBoundingClientRect();
    const anchor_x = bounds.left + draft.x * bounds.width;
    const anchor_y = bounds.top + draft.y * bounds.height;
    const width = elements.comment_popover.offsetWidth;
    const height = elements.comment_popover.offsetHeight;
    const left = clamp(anchor_x - 22, viewport_left + 12, viewport_left + viewport_width - width - 12);
    const below = anchor_y + 24;
    const above = anchor_y - height - 24;
    const top = below + height <= viewport_top + viewport_height - 12 ? below : above;
    elements.comment_popover.style.left = `${left}px`;
    elements.comment_popover.style.top = `${clamp(top, viewport_top + 12, viewport_top + viewport_height - height - 12)}px`;
}

function resize_comment_input() {
    elements.comment_input.style.height = 'auto';
    elements.comment_input.style.height = `${Math.min(160, elements.comment_input.scrollHeight)}px`;
    position_popover();
}

function focus_comment_input() {
    resize_comment_input();
    elements.comment_input.focus({ preventScroll: true });
    requestAnimationFrame(position_popover);
}

function position_marker(element, annotation) {
    element.style.left = `${annotation.x * 100}%`;
    element.style.top = `${annotation.y * 100}%`;
    element.style.width = annotation.type === 'area' ? `${annotation.width * 100}%` : '';
    element.style.height = annotation.type === 'area' ? `${annotation.height * 100}%` : '';
    element.classList.toggle('area_marker', annotation.type === 'area');
}

function render_draft() {
    elements.draft_marker.hidden = !draft;
    if (draft) {
        position_marker(elements.draft_marker, draft);
        elements.draft_marker.firstElementChild.textContent = editing_id ? String(annotations.findIndex((item) => item.id === editing_id) + 1) : String(annotations.length + 1);
        position_popover();
    }
}

function render_annotations() {
    elements.marker_layer.replaceChildren();
    elements.comments_list.replaceChildren();
    annotations.forEach((annotation, index) => {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'annotation_marker';
        marker.dataset.annotation_id = String(annotation.id);
        marker.classList.toggle('selected_marker', annotation.id === selected_id);
        marker.setAttribute('aria-label', `Commentaire ${index + 1} : ${annotation.text}`);
        marker.title = `${index + 1}. ${annotation.text}`;
        const badge = document.createElement('span');
        badge.className = 'marker_badge';
        badge.textContent = String(index + 1);
        marker.append(badge);
        position_marker(marker, annotation);
        marker.addEventListener('click', () => edit_annotation(annotation.id));
        marker.disabled = is_exporting;
        elements.marker_layer.append(marker);
        const row = elements.comment_template.content.firstElementChild.cloneNode(true);
        row.id = `comment_${annotation.id}`;
        row.classList.toggle('selected_row', annotation.id === selected_id);
        row.querySelector('.number_badge').textContent = String(index + 1);
        row.querySelector('.comment_text').textContent = annotation.text;
        const location_button = row.querySelector('.comment_location');
        location_button.setAttribute('aria-label', `Modifier le commentaire ${index + 1}`);
        location_button.addEventListener('click', () => edit_annotation(annotation.id, true));
        row.querySelector('.edit_button').addEventListener('click', () => edit_annotation(annotation.id, true));
        row.querySelector('.delete_button').addEventListener('click', () => delete_annotation(annotation.id));
        row.querySelectorAll('button').forEach((button) => { button.disabled = is_exporting; });
        elements.comments_list.append(row);
    });
    update_controls();
}

function cancel_draft() {
    draft = null;
    editing_id = null;
    pointer_start = null;
    selected_id = null;
    elements.comment_input.value = '';
    elements.marker_layer.querySelectorAll('.selected_marker').forEach((marker) => marker.classList.remove('selected_marker'));
    elements.comments_list.querySelectorAll('.selected_row').forEach((row) => row.classList.remove('selected_row'));
    render_draft();
    update_controls();
}

function edit_annotation(id, reveal = false) {
    if (is_exporting) return;
    finish_draft();
    const annotation = annotations.find((item) => item.id === id);
    if (!annotation) return;
    if (reveal) elements.image_surface.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    editing_id = id;
    draft = { ...annotation };
    selected_id = id;
    elements.comment_input.value = annotation.text;
    render_annotations();
    render_draft();
    focus_comment_input();
    set_status('');
}

function delete_annotation(id) {
    if (is_exporting) return;
    if (draft && editing_id !== id) finish_draft();
    const index = annotations.findIndex((item) => item.id === id);
    annotations = annotations.filter((item) => item.id !== id);
    if (editing_id === id) cancel_draft();
    if (selected_id === id) selected_id = null;
    render_annotations();
    render_draft();
    const next_row = elements.comments_list.children[Math.min(index, annotations.length - 1)];
    if (next_row) next_row.querySelector('.delete_button').focus({ preventScroll: true });
    else elements.image_surface.focus({ preventScroll: true });
    set_status('Commentaire supprimé.');
}

function begin_draft(annotation, focus = true) {
    if (!editing_id && annotations.length >= maximum_comments) {
        set_status(`Une planche peut contenir jusqu’à ${maximum_comments} commentaires.`, true);
        return;
    }
    draft = annotation;
    render_draft();
    update_controls();
    if (focus) focus_comment_input();
    set_status('');
}

function get_pointer_position(event) {
    const bounds = elements.image_surface.getBoundingClientRect();
    return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
}

function set_tool(tool) {
    if (is_exporting) return;
    current_tool = tool;
    elements.point_button.setAttribute('aria-pressed', String(tool === 'point'));
    elements.area_button.setAttribute('aria-pressed', String(tool === 'area'));
    elements.tool_hint.textContent = tool === 'point' ? 'Cliquez pour commenter' : 'Glissez pour encadrer';
}

async function load_image(file) {
    const version = ++load_version;
    if (file.size > maximum_file_bytes) {
        set_status('Cette image dépasse 30 Mo. Choisissez un fichier plus léger.', true);
        return;
    }
    if (!/\.(png|jpe?g|webp|avif|gif|bmp)$/iu.test(file.name) && !/^image\/(png|jpeg|webp|avif|gif|bmp)$/iu.test(file.type)) {
        set_status('Format non pris en charge. Choisissez une image PNG, JPG, WebP, AVIF, GIF ou BMP.', true);
        return;
    }
    let candidate_url = URL.createObjectURL(file);
    set_status('Chargement de l’image…');
    try {
        const candidate_image = new Image();
        candidate_image.src = candidate_url;
        await candidate_image.decode();
        if (version !== load_version) return;
        if (!candidate_image.naturalWidth || candidate_image.naturalWidth * candidate_image.naturalHeight > maximum_image_pixels || Math.max(candidate_image.naturalWidth, candidate_image.naturalHeight) > 20000) {
            throw new Error('Cette image est trop grande. La limite est de 60 millions de pixels et 20 000 pixels par côté.');
        }
        const snapshot = document.createElement('canvas');
        snapshot.width = candidate_image.naturalWidth;
        snapshot.height = candidate_image.naturalHeight;
        const snapshot_context = snapshot.getContext('2d');
        if (!snapshot_context) throw new Error('Impossible de lire cette image.');
        snapshot_context.drawImage(candidate_image, 0, 0);
        const snapshot_blob = await new Promise((resolve) => snapshot.toBlob(resolve, 'image/png'));
        snapshot.width = 1;
        snapshot.height = 1;
        if (!snapshot_blob) throw new Error('Impossible de lire cette image. Essayez un fichier plus petit.');
        if (version !== load_version) return;
        URL.revokeObjectURL(candidate_url);
        candidate_url = URL.createObjectURL(snapshot_blob);
        const stable_image = new Image();
        stable_image.src = candidate_url;
        await stable_image.decode();
        if (version !== load_version) return;
        const previous_url = source_url;
        source_url = candidate_url;
        candidate_url = null;
        source_file = file;
        elements.source_image.src = source_url;
        elements.source_image.alt = file.name;
        elements.file_name.textContent = file.name;
        elements.file_name.title = file.name;
        elements.file_dimensions.textContent = `${stable_image.naturalWidth} × ${stable_image.naturalHeight} px`;
        annotations = [];
        selected_id = null;
        next_id = 1;
        cancel_draft();
        set_tool('point');
        render_annotations();
        elements.import_section.hidden = true;
        elements.workspace_section.hidden = false;
        elements.app_shell.classList.add('workspace_open');
        if (previous_url) URL.revokeObjectURL(previous_url);
        if (export_url) URL.revokeObjectURL(export_url);
        export_url = null;
        set_status(/\.(gif|webp|avif)$/iu.test(file.name) ? 'Image chargée. Les éventuelles animations sont figées pour l’annotation.' : '');
        elements.image_surface.focus({ preventScroll: true });
    } catch (error) {
        if (version === load_version) set_status(error instanceof DOMException ? 'Impossible de lire ce fichier. Vérifiez qu’il s’agit d’une image valide.' : error.message, true);
    } finally {
        if (candidate_url) URL.revokeObjectURL(candidate_url);
    }
}

function request_image(file) {
    if (!file || is_exporting) return;
    if (annotations.length || has_unsaved_text()) {
        pending_file = file;
        if (!elements.replace_dialog.open) elements.replace_dialog.showModal();
        return;
    }
    load_image(file);
}

function import_files(files) {
    if (files.length !== 1) {
        set_status('Déposez une seule image à la fois.', true);
        return;
    }
    request_image(files[0]);
}

elements.drop_zone.addEventListener('click', () => elements.file_input.click());
elements.replace_button.addEventListener('click', () => elements.file_input.click());
elements.file_input.addEventListener('change', () => {
    if (elements.file_input.files.length) import_files(elements.file_input.files);
    elements.file_input.value = '';
});
elements.confirm_replace_button.addEventListener('click', () => {
    const file = pending_file;
    pending_file = null;
    elements.replace_dialog.close();
    if (file) load_image(file);
});
elements.cancel_replace_button.addEventListener('click', () => elements.replace_dialog.close());
elements.replace_dialog.addEventListener('close', () => { pending_file = null; });
elements.point_button.addEventListener('click', () => set_tool('point'));
elements.area_button.addEventListener('click', () => set_tool('area'));
elements.cancel_button.addEventListener('click', () => {
    cancel_draft();
    set_status('');
    elements.image_surface.focus({ preventScroll: true });
});
function save_annotation(focus = true) {
    const text = elements.comment_input.value.trim();
    if (!draft || !text || is_exporting) return;
    if (editing_id) {
        annotations = annotations.map((item) => item.id === editing_id ? { ...draft, text, id: editing_id } : item);
    } else {
        annotations.push({ ...draft, text, id: next_id++ });
    }
    cancel_draft();
    render_annotations();
    set_status('Commentaire enregistré.');
    if (focus) elements.image_surface.focus({ preventScroll: true });
}

function finish_draft() {
    if (!draft || is_exporting) return;
    if (has_unsaved_text()) save_annotation(false);
    else cancel_draft();
}

elements.comment_input.addEventListener('input', () => {
    update_controls();
    resize_comment_input();
});
elements.comment_form.addEventListener('submit', (event) => {
    event.preventDefault();
    save_annotation();
});
elements.comment_input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        elements.comment_form.requestSubmit();
    }
});
elements.delete_draft_button.addEventListener('click', () => {
    if (editing_id) delete_annotation(editing_id);
});

document.addEventListener('pointerdown', (event) => {
    if (draft && !elements.comment_popover.contains(event.target) && !elements.marker_layer.contains(event.target) && !elements.comments_list.contains(event.target)) finish_draft();
}, true);

document.addEventListener('focusin', (event) => {
    if (draft && !pointer_start && !elements.comment_popover.contains(event.target) && event.target !== elements.image_surface && !elements.marker_layer.contains(event.target) && !elements.comments_list.contains(event.target)) finish_draft();
});

window.addEventListener('resize', position_popover);
window.addEventListener('scroll', position_popover, true);
window.visualViewport?.addEventListener('resize', position_popover);
window.visualViewport?.addEventListener('scroll', position_popover);
const popover_observer = new ResizeObserver(position_popover);
popover_observer.observe(elements.comment_popover);
popover_observer.observe(elements.image_surface);

elements.image_surface.addEventListener('pointerdown', (event) => {
    if (is_exporting || event.button !== 0 || !event.isPrimary || event.target.closest('button') || pointer_start) return;
    event.preventDefault();
    const position = get_pointer_position(event);
    pointer_start = { ...position, pointer_id: event.pointerId, previous_draft: draft ? { ...draft } : null };
    elements.image_surface.setPointerCapture(event.pointerId);
    if (current_tool === 'area') begin_draft({ type: 'area', ...position, width: 0, height: 0 }, false);
});
elements.image_surface.addEventListener('pointermove', (event) => {
    if (!pointer_start || pointer_start.pointer_id !== event.pointerId || current_tool !== 'area' || !draft) return;
    const position = get_pointer_position(event);
    draft = { type: 'area', x: Math.min(pointer_start.x, position.x), y: Math.min(pointer_start.y, position.y), width: Math.abs(position.x - pointer_start.x), height: Math.abs(position.y - pointer_start.y) };
    render_draft();
});
elements.image_surface.addEventListener('pointerup', (event) => {
    if (!pointer_start || pointer_start.pointer_id !== event.pointerId) return;
    const start = pointer_start;
    pointer_start = null;
    if (elements.image_surface.hasPointerCapture(event.pointerId)) elements.image_surface.releasePointerCapture(event.pointerId);
    const position = get_pointer_position(event);
    if (current_tool === 'point') {
        begin_draft({ type: 'point', ...position });
    } else if (draft) {
        const bounds = elements.image_surface.getBoundingClientRect();
        if (draft.width * bounds.width < 6 || draft.height * bounds.height < 6) {
            draft = start.previous_draft;
            render_draft();
            update_controls();
            set_status('Glissez sur l’image pour dessiner une zone, ou utilisez le mode Point.', true);
        } else {
            update_controls();
            focus_comment_input();
        }
    }
});
elements.image_surface.addEventListener('pointercancel', () => {
    if (pointer_start) draft = pointer_start.previous_draft;
    pointer_start = null;
    render_draft();
    update_controls();
});
elements.image_surface.addEventListener('keydown', (event) => {
    if (event.target !== elements.image_surface || is_exporting) return;
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (draft) focus_comment_input();
        else begin_draft(current_tool === 'point' ? { type: 'point', x: 0.5, y: 0.5 } : { type: 'area', x: 0.35, y: 0.35, width: 0.3, height: 0.3 }, false);
    }
    const movements = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (draft && movements[event.key]) {
        event.preventDefault();
        const movement = movements[event.key];
        const step = event.shiftKey ? 0.05 : 0.01;
        draft.x = clamp(draft.x + movement[0] * step, 0, 1 - (draft.width || 0));
        draft.y = clamp(draft.y + movement[1] * step, 0, 1 - (draft.height || 0));
        render_draft();
    }
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && draft && !elements.export_dialog.open && !elements.replace_dialog.open) {
        cancel_draft();
        elements.image_surface.focus({ preventScroll: true });
    }
});

function clear_drag_state() {
    drag_depth = 0;
    elements.drop_zone.classList.remove('dragging');
    elements.image_stage.classList.remove('dragging');
}

document.addEventListener('dragenter', (event) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    drag_depth++;
    const target = source_file ? elements.image_stage : elements.drop_zone;
    target.classList.add('dragging');
});
document.addEventListener('dragover', (event) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = is_exporting ? 'none' : 'copy';
});
document.addEventListener('dragleave', () => {
    drag_depth--;
    if (drag_depth <= 0) clear_drag_state();
});
document.addEventListener('drop', (event) => {
    event.preventDefault();
    clear_drag_state();
    if (event.dataTransfer.files.length) import_files(event.dataTransfer.files);
});
window.addEventListener('blur', clear_drag_state);

elements.export_button.addEventListener('click', async () => {
    finish_draft();
    if (is_exporting || !annotations.length) return;
    is_exporting = true;
    render_annotations();
    elements.export_button_label.textContent = 'Création…';
    set_status('Préparation de votre planche…');
    try {
        await elements.source_image.decode();
        const result = await create_annotation_png(elements.source_image, source_file.name, annotations);
        if (export_url) URL.revokeObjectURL(export_url);
        export_url = URL.createObjectURL(result.blob);
        elements.export_image.src = export_url;
        elements.download_link.href = export_url;
        const base_name = source_file.name.replace(/\.[^.]+$/u, '').replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/gu, '') || 'image';
        elements.download_link.download = `${base_name}_notes.png`;
        elements.export_dimensions.textContent = `${result.width.toLocaleString('fr-FR')} × ${result.height.toLocaleString('fr-FR')} px · ${(result.blob.size / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
        elements.export_dialog.showModal();
        set_status('Votre PNG est prêt.');
    } catch (error) {
        set_status(error.message || 'Impossible de créer le PNG. Réessayez avec une image plus petite.', true);
    } finally {
        is_exporting = false;
        elements.export_button_label.textContent = 'Exporter le PNG';
        render_annotations();
    }
});
elements.close_export_button.addEventListener('click', () => elements.export_dialog.close());
elements.download_link.addEventListener('click', () => set_status('Téléchargement du PNG lancé.'));
window.addEventListener('beforeunload', (event) => {
    if (annotations.length || has_unsaved_text()) event.preventDefault();
});
update_controls();
