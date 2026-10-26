/*
 * Engraving preview
 * Draws the customer's text over the product photo as they type and shrinks
 * it to fit the engraving area. No dependencies.
 *
 * Markup hooks (see snippets/engraving-preview.liquid):
 *   [data-engraving-preview]   root, with data-area="left,top,width,height" in %
 *   [data-engraving-input="n"] text input for line n
 *   [data-engraving-line="n"]  where line n is drawn on the photo
 *   [data-engraving-count="n"] character counter for line n
 *   [data-engraving-font]      font radio buttons
 *   [data-engraving-status]    polite live region for screen readers
 */
(() => {
  const LINE_HEIGHT = 1.15;
  const MIN_FONT_PX = 8;
  const FILL = 0.9; // share of the engraving area the text may use, leaving a margin

  class EngravingPreview {
    constructor(root) {
      this.root = root;
      this.stage = root.querySelector('.engraving__stage');
      this.area = root.querySelector('.engraving__area');
      this.inputs = [...root.querySelectorAll('[data-engraving-input]')];
      this.fonts = [...root.querySelectorAll('[data-engraving-font]')];
      this.status = root.querySelector('[data-engraving-status]');
      this.statusTimer = null;

      this.placeArea(root.dataset.area);
      this.linkForm();

      this.inputs.forEach((input) => input.addEventListener('input', () => this.update()));
      this.fonts.forEach((radio) => radio.addEventListener('change', () => this.changeFont()));

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
        const line = this.root.querySelector(`[data-engraving-line="${n}"]`);
        const count = this.root.querySelector(`[data-engraving-count="${n}"]`);
        if (line) line.textContent = input.value.trim();
        if (count) count.textContent = `${input.value.length}/${input.maxLength}`;
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
      if (!filled.length) return;

      const boxWidth = this.area.clientWidth * FILL;
      const boxHeight = this.area.clientHeight * FILL;
      if (!boxWidth || !boxHeight) return;

      // Start as large as the height allows, then shrink so the widest line fits.
      let size = boxHeight / (filled.length * LINE_HEIGHT);
      this.area.style.fontSize = `${size}px`;
      const widest = Math.max(...filled.map((line) => line.scrollWidth));
      if (widest > boxWidth) size *= boxWidth / widest;
      this.area.style.fontSize = `${Math.max(size, MIN_FONT_PX)}px`;
    }

    announce() {
      if (!this.status) return;
      clearTimeout(this.statusTimer);
      this.statusTimer = setTimeout(() => {
        const text = this.inputs.map((input) => input.value.trim()).filter(Boolean).join(', ');
        this.status.textContent = text
          ? `Preview shows: ${text}, in ${this.selectedFont}.`
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
