const export_palette = {
    page: '#08090b',
    surface: '#13161a',
    ink: '#f1f0eb',
    muted: '#858a93',
    line: '#242830',
    accent: '#c2ff5c',
    accent_ink: '#101307'
};

function set_export_font(context, size, weight = 400) {
    context.font = `${weight} ${size}px "Bricolage Grotesque", sans-serif`;
}

function wrap_export_text(context, text, maximum_width) {
    const lines = [];
    const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('fr', { granularity: 'grapheme' }) : null;
    for (const paragraph of text.split('\n')) {
        if (!paragraph.trim()) {
            lines.push('');
            continue;
        }
        let line = '';
        for (const word of paragraph.trim().split(/\s+/u)) {
            const candidate = line ? `${line} ${word}` : word;
            if (context.measureText(candidate).width <= maximum_width) {
                line = candidate;
                continue;
            }
            if (line) lines.push(line);
            line = '';
            if (context.measureText(word).width <= maximum_width) {
                line = word;
                continue;
            }
            const characters = segmenter ? Array.from(segmenter.segment(word), (part) => part.segment) : Array.from(word);
            for (const character of characters) {
                if (line && context.measureText(line + character).width > maximum_width) {
                    lines.push(line);
                    line = character;
                } else {
                    line += character;
                }
            }
        }
        if (line) lines.push(line);
    }
    return lines;
}

function truncate_export_text(context, text, maximum_width) {
    if (context.measureText(text).width <= maximum_width) return text;
    const characters = Array.from(text);
    while (characters.length && context.measureText(`${characters.join('')}…`).width > maximum_width) characters.pop();
    return `${characters.join('')}…`;
}

function draw_export_badge(context, x, y, number, radius = 19) {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = export_palette.accent;
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = export_palette.page;
    context.stroke();
    context.fillStyle = export_palette.accent_ink;
    set_export_font(context, radius * 0.95, 700);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(number), x, y + 1);
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
}

function draw_export_marker(context, annotation, number, image_box) {
    const x = image_box.x + annotation.x * image_box.width;
    const y = image_box.y + annotation.y * image_box.height;
    if (annotation.type === 'area') {
        const width = annotation.width * image_box.width;
        const height = annotation.height * image_box.height;
        context.fillStyle = '#c2ff5c16';
        context.fillRect(x, y, width, height);
        context.strokeStyle = export_palette.page;
        context.lineWidth = 5;
        context.strokeRect(x, y, width, height);
        context.strokeStyle = export_palette.accent;
        context.lineWidth = 3;
        context.strokeRect(x, y, width, height);
    }
    draw_export_badge(context, x, y, number);
}

function draw_export_crop(context, source, annotation, box) {
    const center_x = (annotation.x + (annotation.width || 0) / 2) * source.naturalWidth;
    const center_y = (annotation.y + (annotation.height || 0) / 2) * source.naturalHeight;
    const base_size = Math.min(source.naturalWidth, source.naturalHeight) * 0.24;
    const crop_size = Math.min(Math.max(base_size, (annotation.width || 0) * source.naturalWidth * 1.25, (annotation.height || 0) * source.naturalHeight * 1.25), Math.max(source.naturalWidth, source.naturalHeight));
    const crop_width = Math.min(crop_size, source.naturalWidth);
    const crop_height = Math.min(crop_size, source.naturalHeight);
    const source_x = Math.max(0, Math.min(source.naturalWidth - crop_width, center_x - crop_width / 2));
    const source_y = Math.max(0, Math.min(source.naturalHeight - crop_height, center_y - crop_height / 2));
    const scale = Math.min(box.width / crop_width, box.height / crop_height);
    const target_width = crop_width * scale;
    const target_height = crop_height * scale;
    const target_x = box.x + (box.width - target_width) / 2;
    const target_y = box.y + (box.height - target_height) / 2;
    context.save();
    context.beginPath();
    context.roundRect(box.x, box.y, box.width, box.height, 8);
    context.clip();
    context.fillStyle = export_palette.surface;
    context.fillRect(box.x, box.y, box.width, box.height);
    context.drawImage(source, source_x, source_y, crop_width, crop_height, target_x, target_y, target_width, target_height);
    const point_x = target_x + (annotation.x * source.naturalWidth - source_x) * scale;
    const point_y = target_y + (annotation.y * source.naturalHeight - source_y) * scale;
    context.strokeStyle = export_palette.accent;
    context.lineWidth = 2;
    if (annotation.type === 'area') {
        context.strokeRect(point_x, point_y, annotation.width * source.naturalWidth * scale, annotation.height * source.naturalHeight * scale);
    } else {
        context.beginPath();
        context.arc(point_x, point_y, 5, 0, Math.PI * 2);
        context.fillStyle = export_palette.accent;
        context.fill();
        context.strokeStyle = export_palette.page;
        context.stroke();
    }
    context.restore();
}

async function create_annotation_png(source, file_name, annotations) {
    await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2000))]);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Le navigateur ne permet pas de créer un PNG.');
    const layout_width = 1200;
    const margin = 56;
    const content_width = layout_width - margin * 2;
    const image_scale = Math.min(content_width / source.naturalWidth, 1500 / source.naturalHeight);
    const image_box = {
        x: (layout_width - source.naturalWidth * image_scale) / 2,
        y: 158,
        width: source.naturalWidth * image_scale,
        height: source.naturalHeight * image_scale
    };
    const text_x = margin + 190;
    const text_width = layout_width - margin - text_x;
    set_export_font(context, 22);
    const rows = annotations.map((annotation) => {
        const lines = wrap_export_text(context, annotation.text, text_width);
        return { annotation, lines, height: Math.max(150, 66 + lines.length * 32) };
    });
    const comments_y = image_box.y + image_box.height + 80;
    const layout_height = Math.ceil(comments_y + 42 + rows.reduce((height, row) => height + row.height, 0) + 82);
    const output_scale = Math.min(2, 16000 / layout_height, Math.sqrt(32000000 / (layout_width * layout_height)));
    if (output_scale < 0.75) throw new Error('Cette planche contient trop de texte pour un PNG lisible. Réduisez le nombre ou la longueur des commentaires.');
    canvas.width = Math.round(layout_width * output_scale);
    canvas.height = Math.round(layout_height * output_scale);
    context.scale(output_scale, output_scale);
    context.fillStyle = export_palette.page;
    context.fillRect(0, 0, layout_width, layout_height);
    context.fillStyle = export_palette.ink;
    set_export_font(context, 34, 600);
    context.fillText('Image Notes', margin, 73);
    context.fillStyle = export_palette.accent;
    context.fillText('.', margin + context.measureText('Image Notes').width + 2, 73);
    set_export_font(context, 18);
    context.fillStyle = export_palette.muted;
    context.fillText(truncate_export_text(context, file_name, content_width - 200), margin, 108);
    context.textAlign = 'right';
    context.fillText(`${annotations.length} commentaire${annotations.length > 1 ? 's' : ''}`, layout_width - margin, 75);
    context.textAlign = 'left';
    context.fillStyle = export_palette.surface;
    context.fillRect(image_box.x, image_box.y, image_box.width, image_box.height);
    context.drawImage(source, image_box.x, image_box.y, image_box.width, image_box.height);
    annotations.forEach((annotation, index) => draw_export_marker(context, annotation, index + 1, image_box));
    context.fillStyle = export_palette.ink;
    set_export_font(context, 26, 600);
    context.fillText('Commentaires', margin, comments_y);
    let row_y = comments_y + 32;
    rows.forEach(({ annotation, lines, height }, index) => {
        context.strokeStyle = export_palette.line;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(margin, row_y);
        context.lineTo(layout_width - margin, row_y);
        context.stroke();
        draw_export_crop(context, source, annotation, { x: margin, y: row_y + 24, width: 112, height: 102 });
        draw_export_badge(context, margin + 151, row_y + 42, index + 1, 16);
        set_export_font(context, 14, 500);
        context.fillStyle = export_palette.muted;
        context.fillText(annotation.type === 'area' ? 'ZONE' : 'POINT', text_x, row_y + 33);
        set_export_font(context, 22);
        context.fillStyle = export_palette.ink;
        lines.forEach((line, line_index) => context.fillText(line, text_x, row_y + 66 + line_index * 32));
        row_y += height;
    });
    context.strokeStyle = export_palette.line;
    context.beginPath();
    context.moveTo(margin, row_y);
    context.lineTo(layout_width - margin, row_y);
    context.stroke();
    set_export_font(context, 14);
    context.fillStyle = export_palette.muted;
    context.fillText(`${source.naturalWidth} × ${source.naturalHeight} px · Image source`, margin, row_y + 42);
    context.textAlign = 'right';
    context.fillText('Image Notes', layout_width - margin, row_y + 42);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('La création du PNG a échoué. Essayez avec une image plus petite.');
    const result = { blob, width: canvas.width, height: canvas.height };
    canvas.width = 1;
    canvas.height = 1;
    return result;
}
