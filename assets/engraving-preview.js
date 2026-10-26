/*
 * Engraving preview
 * Draws the customer's text and logo over the product photo as they type and
 * shrinks them to fit the engraving area. No dependencies.
 *
 * Markup hooks (see snippets/engraving-preview.liquid):
 *   [data-engraving-preview]         root, with data-area="left,top,width,height" in %
 *   [data-engraving-input="n"]       text input for line n
 *   [data-engraving-size="n"]        Small / Medium / Large select for line n
 *   [data-engraving-line="n"]        where line n is drawn on the photo
 *   [data-engraving-count="n"]       character counter for line n
 *   [data-engraving-font]            font radio buttons
 *   [data-engraving-logo-input]      logo file input
 *   [data-engraving-logo-preview]    where the logo is drawn on the photo
 *   [data-engraving-logo-position]   Top / Bottom radio buttons
 *   [data-engraving-logo-options]    position and remove controls, shown once a logo is added
 *   [data-engraving-logo-message]    upload feedback
 *   [data-engraving-logo-remove]     remove logo button
 *   [data-engraving-status]          polite live region for screen readers
 */
(() => {
  const LINE_HEIGHT = 1.15;
  const MIN_FONT_PX = 8;
  const FILL = 0.9; // share of the engraving area the text may use, leaving a margin
  const SIZE_SCALE = { Small: 0.75, Medium: 1, Large: 1.3 };
  const LOGO_SHARE = 0.42; // share of the area height the logo takes when there is text too
  const LOGO_GAP = 0.05; // gap between logo and text, as a share of the area height
  const LOGO_MAX_BYTES = 10 * 1024 * 1024;
  const LOGO_MIN_PX = 500; // smaller raster logos may look blurry when engraved
  const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  const LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'svg', 'webp'];

  class EngravingPreview {
    constructor(root) {
      this.root = root;
      this.stage = root.querySelector('.engraving__stage');
      this.area = root.querySelector('.engraving__area');
      this.inputs = [...root.querySelectorAll('[data-engraving-input]')];
      this.sizes = [...root.querySelectorAll('[data-engraving-size]')];
      this.fonts = [...root.querySelectorAll('[data-engraving-font]')];
      this.status = root.querySelector('[data-engraving-status]');
      this.statusTimer = null;

      this.logoInput = root.querySelector('[data-engraving-logo-input]');
      this.logoPreview = root.querySelector('[data-engraving-logo-preview]');
      this.logoPositions = [...root.querySelectorAll('[data-engraving-logo-position]')];
      this.logoOptions = root.querySelector('[data-engraving-logo-options]');
      this.logoMessage = root.querySelector('[data-engraving-logo-message]');
      this.logoRemove = root.querySelector('[data-engraving-logo-remove]');
      this.logoUrl = null;

      this.placeArea(root.dataset.area);
      this.linkForm();

      this.inputs.forEach((input) => input.addEventListener('input', () => this.update()));
      this.sizes.forEach((select) => select.addEventListener('change', () => this.update()));
      this.fonts.forEach((radio) => radio.addEventListener('change', () => this.changeFont()));

      // A product without a photo has no preview area, so the logo upload has nothing to draw on.
      if (this.logoInput && this.logoPreview && this.area) {
        this.logoInput.addEventListener('change', () => this.handleLogo());
        this.logoPositions.forEach((radio) => radio.addEventListener('change', () => this.placeLogo()));
        if (this.logoRemove) this.logoRemove.addEventListener('click', () => this.removeLogo());
      }

      // Refit when the photo changes size (window resize, gallery layout, image load).
      if (this.stage && 'ResizeObserver' in window) {
        new ResizeObserver(() => this.fit()).observe(this.stage);
      }

      this.changeFont();
    }

    // The fields send their values with the add to cart form through the `form` attribute.
    // Themes name that form differently (Dawn: product-form-…, Horizon: BuyButtons-ProductForm-…),
    // so if the expected ID isn't on the page, use the cart form in the same section.
    linkForm() {
      const fields = [...this.root.querySelectorAll('[form]')];
      const formId = fields.length ? fields[0].getAttribute('form') : '';
      if (!fields.length || document.getElementById(formId)) return;

      const scope = this.root.closest('.shopify-section') || document;
      const form = scope.querySelector('form[action*="/cart/add"]') || document.querySelector('form[action*="/cart/add"]');
      if (!form) return;
      // Read the ID with getAttribute: product forms contain an input named "id" (the variant),
      // and on a form element `form.id` returns that input instead of the form's own ID.
      let id = form.getAttribute('id');
      if (!id) {
        id = `engraving-product-form-${Math.random().toString(36).slice(2, 8)}`;
        form.setAttribute('id', id);
      }
      fields.forEach((field) => field.setAttribute('form', id));
    }

    get formId() {
      return this.inputs.length ? this.inputs[0].getAttribute('form') : '';
    }

    placeArea(value) {
      if (!this.area) return;
      const [left, top, width, height] = (value || '')
        .split(',')
        .map((n) => parseFloat(n));
      if ([left, top, width, height].some(Number.isNaN)) return;
      Object.assign(this.area.style, {
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
      });
    }

    get selectedFont() {
      const checked = this.fonts.find((radio) => radio.checked);
      return checked ? checked.value : '';
    }

    sizeOf(n) {
      const select = this.root.querySelector(`[data-engraving-size="${n}"]`);
      return select ? select.value : 'Medium';
    }

    async changeFont() {
      const font = this.selectedFont;
      if (this.area && font) this.area.style.fontFamily = `'${font}', serif`;
      // Measure only after the web font has loaded, or the fit uses the fallback font's widths.
      if (font && document.fonts && document.fonts.load) {
        try {
          await document.fonts.load(`32px '${font}'`);
        } catch (e) {
          /* fall back to whatever font is available */
        }
      }
      this.update();
    }

    update() {
      this.inputs.forEach((input) => {
        const n = input.dataset.engravingInput;
        const text = input.value.trim();
        const line = this.root.querySelector(`[data-engraving-line="${n}"]`);
        const count = this.root.querySelector(`[data-engraving-count="${n}"]`);
        const size = this.root.querySelector(`[data-engraving-size="${n}"]`);
        if (line) line.textContent = text;
        if (count) count.textContent = `${input.value.length}/${input.maxLength}`;
        // A disabled select isn't sent, so empty lines don't add a size to the order.
        if (size) size.disabled = !text;
      });
      this.fit();
      this.announce();
    }

    fit() {
      if (!this.area) return;
      const lines = [...this.area.querySelectorAll('[data-engraving-line]')];
      const filled = lines.filter((line) => line.textContent);
      lines.forEach((line) => {
        line.hidden = !line.textContent;
      });
      const hasLogo = this.logoPreview && !this.logoPreview.hidden;
      if (!filled.length && !hasLogo) return;

      const boxWidth = this.area.clientWidth * FILL;
      const boxHeight = this.area.clientHeight * FILL;
      if (!boxWidth || !boxHeight) return;

      // The logo takes a fixed share of the height; the text fits in what's left.
      let textHeight = boxHeight;
      if (hasLogo) {
        const logoHeight = filled.length ? boxHeight * LOGO_SHARE : boxHeight;
        const gap = filled.length ? boxHeight * LOGO_GAP : 0;
        Object.assign(this.logoPreview.style, {
          maxHeight: `${logoHeight}px`,
          maxWidth: `${boxWidth}px`,
        });
        this.area.style.gap = `${gap}px`;
        textHeight = boxHeight - logoHeight - gap;
      } else {
        this.area.style.gap = '';
      }
      if (!filled.length) return;

      // Each line keeps its chosen size relative to the others. Start as large as the
      // height allows, then shrink every line by the same factor if one is too wide.
      const scales = filled.map((line) => SIZE_SCALE[this.sizeOf(line.dataset.engravingLine)] || 1);
      let base = textHeight / (scales.reduce((sum, scale) => sum + scale, 0) * LINE_HEIGHT);
      filled.forEach((line, i) => {
        line.style.fontSize = `${base * scales[i]}px`;
      });
      const ratio = Math.min(...filled.map((line) => boxWidth / line.scrollWidth));
      if (ratio < 1) base *= ratio;
      filled.forEach((line, i) => {
        line.style.fontSize = `${Math.max(base * scales[i], MIN_FONT_PX)}px`;
      });
    }

    handleLogo() {
      const file = this.logoInput.files && this.logoInput.files[0];
      this.clearLogo();
      this.showLogoMessage('');
      if (!file) return;

      const extension = file.name.split('.').pop().toLowerCase();
      if (!LOGO_TYPES.includes(file.type) && !LOGO_EXTENSIONS.includes(extension)) {
        this.rejectLogo('This file type can\'t be engraved. Please upload a PNG, JPG, SVG or WebP.');
        return;
      }
      if (file.size > LOGO_MAX_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        this.rejectLogo(`This file is ${mb} MB. Please upload a logo under 10 MB.`);
        return;
      }

      const isSvg = file.type === 'image/svg+xml' || extension === 'svg';
      const isJpg = file.type === 'image/jpeg' || extension === 'jpg' || extension === 'jpeg';
      this.logoUrl = URL.createObjectURL(file);

      this.logoPreview.onload = () => {
        const warnings = [];
        const { naturalWidth: width, naturalHeight: height } = this.logoPreview;
        if (!isSvg && Math.max(width, height) < LOGO_MIN_PX) {
          warnings.push(`This logo is only ${width} × ${height} pixels, so it may look blurry when engraved. A larger file or an SVG works best.`);
        }
        if (isJpg) {
          warnings.push('JPG logos have a solid background. A PNG with a transparent background or an SVG gives the cleanest engraving.');
        }
        this.showLogoMessage(
          warnings.length ? warnings.join(' ') : 'Logo added. Choose whether it sits above or below the text.',
          warnings.length ? 'warning' : 'ok'
        );
        this.useLogo(true);
      };
      this.logoPreview.onerror = () => {
        this.rejectLogo('This file couldn\'t be read as an image. Please try another file.');
      };
      this.logoPreview.src = this.logoUrl;
    }

    // Turns the logo on or off everywhere: preview, order fields and options.
    useLogo(on) {
      if (on && this.formId) {
        this.logoInput.setAttribute('form', this.formId);
      } else {
        this.logoInput.removeAttribute('form');
      }
      this.logoPreview.hidden = !on;
      this.logoPositions.forEach((radio) => {
        radio.disabled = !on;
      });
      if (this.logoOptions) this.logoOptions.hidden = !on;
      this.placeLogo();
    }

    placeLogo() {
      const bottom = this.logoPositions.some((radio) => radio.checked && radio.value === 'Bottom');
      this.area.classList.toggle('engraving__area--logo-bottom', bottom);
      this.fit();
      this.announce();
    }

    clearLogo() {
      if (this.logoUrl) URL.revokeObjectURL(this.logoUrl);
      this.logoUrl = null;
      this.logoPreview.onload = null;
      this.logoPreview.onerror = null;
      this.logoPreview.removeAttribute('src');
      this.useLogo(false);
    }

    rejectLogo(message) {
      this.logoInput.value = '';
      this.clearLogo();
      this.showLogoMessage(message, 'error');
    }

    removeLogo() {
      this.logoInput.value = '';
      this.clearLogo();
      this.showLogoMessage('');
      this.logoInput.focus();
    }

    showLogoMessage(message, tone = 'ok') {
      if (!this.logoMessage) return;
      this.logoMessage.textContent = message;
      this.logoMessage.dataset.tone = tone;
      this.logoMessage.hidden = !message;
    }

    announce() {
      if (!this.status) return;
      clearTimeout(this.statusTimer);
      this.statusTimer = setTimeout(() => {
        const text = this.inputs.map((input) => input.value.trim()).filter(Boolean).join(', ');
        const logo = this.logoPreview && !this.logoPreview.hidden
          ? ` Logo ${this.area.classList.contains('engraving__area--logo-bottom') ? 'below' : 'above'} the text.`
          : '';
        this.status.textContent = text || logo
          ? `Preview shows: ${text || 'no text'}, in ${this.selectedFont}.${logo}`
          : 'Preview is empty.';
      }, 600);
    }
  }

  const init = () => {
    document.querySelectorAll('[data-engraving-preview]').forEach((root) => {
      if (root.engravingPreview) return;
      root.engravingPreview = new EngravingPreview(root);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Shopify theme editor: set up again when the section is re-rendered.
  document.addEventListener('shopify:section:load', init);
})();
