# Shopify Engraving Preview

A live engraving preview for Shopify product pages. Customers type up to two lines, choose a size for each line, pick a font and add their logo above or below the text, and see it all on the product photo as they go. Everything is saved on the order as line item properties, so it shows up in the cart, at checkout and in the Shopify admin. The logo file is uploaded to Shopify with the order.

Built for personalised products like trophies, plaques, cutting boards and gifts.

![Engraving preview on a timber trophy](demo/screenshot.jpg)

**Try the live demo:** https://madihafqasim.github.io/shopify-engraving-preview/demo/

## Features

- Live preview over the product image, updated on every keystroke
- Small, Medium or Large for each line, with both lines shrinking together if they don't fit
- Logo upload, placed above or below the text, shown in the same engraved style
- Logo checks before the order: wrong file types and files over 10 MB are refused, and small or JPG logos get a plain-English warning
- Font choice from any Google Fonts, with the preview waiting for the font to load before measuring
- Saves `Line 1`, `Line 1 size`, `Line 2`, `Line 2 size`, `Font`, `Logo` and `Logo position` to the order with no app and no extra API calls. Empty lines and a removed logo aren't sent.
- Per-product settings through metafields: engraving position, character limit, fonts, whether line 1 is required and whether to offer a logo
- Works on phones, keyboard friendly, and announces the preview to screen readers
- No dependencies: one Liquid snippet, about 320 lines of JavaScript and one stylesheet

## Files

| File | What it does |
|---|---|
| `snippets/engraving-preview.liquid` | Fields, preview markup and settings |
| `assets/engraving-preview.js` | Live update, text fitting and logo checks |
| `assets/engraving-preview.css` | Layout and the engraved look |
| `demo/` | Standalone demo that runs without Shopify |

## Install (Horizon, Dawn and other Online Store 2.0 themes)

1. **Add the files.** In Shopify admin go to Online Store, Themes, then Edit code on your theme.
   - Under Snippets, add `engraving-preview.liquid` and paste in the snippet.
   - Under Assets, add `engraving-preview.js` and `engraving-preview.css` and paste in each file.
2. **Place it on the product page.** Open Customize, switch to the product template, and in the Product information section add a **Custom Liquid** block above the Buy buttons. Paste:

   ```liquid
   {% render 'engraving-preview', product: product, section: section %}
   ```

3. **Optional: set it per product.** In Settings, Custom data, Products, add any of these metafield definitions, then fill them in on each product:

   | Metafield | Type | Default | Use |
   |---|---|---|---|
   | `engraving.area` | Single line text | `34.1,50.2,32.1,21.1` | Engraving position as `left,top,width,height` in % of the photo |
   | `engraving.max_chars` | Integer | `26` | Characters per line |
   | `engraving.fonts` | Single line text | `Playfair Display,Montserrat,Great Vibes` | Google Fonts to offer |
   | `engraving.required` | True or false | `false` | Make line 1 required before adding to cart |
   | `engraving.logo` | True or false | `true` | Set to false to hide the logo upload on this product |

To find the right `engraving.area` for a photo, open the photo in any image editor and read off where the engraving panel starts and ends as a percentage of the width and height.

## How it works

- The inputs sit outside the product form but use the `form` attribute, so the theme's own add to cart sends them as `properties[...]`. Themes name that form differently (`product-form-…` in Dawn, `BuyButtons-ProductForm-…` in Horizon), so if the expected ID isn't on the page, the script links the fields to the add to cart form in the same section.
- The preview area is positioned over the photo with percentages, so it stays in place at every screen size.
- To fit the text, the script gives each line a share of the height based on its chosen size (Small 0.75, Medium 1, Large 1.3), measures the widest line, and scales every line down by the same factor if it's too wide. With a logo, the logo takes 42% of the height and the text fits in the rest. A `ResizeObserver` refits it when the layout changes.
- The logo input only gets its `form` attribute once a valid file is chosen, so an empty upload is never sent. Shopify stores the file and puts its link in the `Logo` property.
- `mix-blend-mode: multiply` and a light text shadow make the text look burned into the material rather than printed on top.

## Limits

- The preview uses the selected variant's main photo when the page loads. It doesn't follow the customer through other gallery images.
- It's a guide for the customer, not a print-ready proof. Production artwork should still be approved separately.
- The logo preview turns colours to a warm grey to suggest engraving. It doesn't remove a JPG's background, which is why JPGs get a warning.
- If a page has more than one add to cart form in the same section, pass the right one: `{% render 'engraving-preview', product: product, section: section, form_id: 'your-form-id' %}`.

## Licence

MIT. See [LICENSE](LICENSE).

Built by Madiha F., web designer and SEO consultant.
