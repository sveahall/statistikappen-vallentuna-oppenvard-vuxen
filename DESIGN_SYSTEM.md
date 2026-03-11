# Design System - Municipality Template

## Typografi

### Rubriker
- `.text-h1` - Största rubriken (text-3xl, font-semibold)
- `.text-h2` - Andra största (text-2xl, font-semibold) 
- `.text-h3` - Tredje största (text-xl, font-semibold)
- `.text-h4` - Fjärde största (text-lg, font-semibold)

### Brödtext
- `.text-body-large` - Större brödtext (text-lg)
- `.text-body` - Standard brödtext (text-base)
- `.text-body-small` - Mindre brödtext (text-sm)
- `.text-body-xs` - Mycket liten text (text-sm)

### Labels & Beskrivningar
- `.text-label` - Formulärlabels (text-sm, font-medium)
- `.text-label-small` - Små labels (text-sm, font-medium)
- `.text-caption` - Hjälptext/noter (text-sm, text-gray-500)

## Layout & Spacing

### Container-bredder
- `.content-container` - Standard bredd (max-w-6xl)
- `.content-container-wide` - Bredare (max-w-7xl)
- `.content-container-narrow` - Smalare (max-w-4xl)

### Sektion-spacing
- `.section-spacing` - Standard mellanrum (mb-8)
- `.section-spacing-small` - Mindre mellanrum (mb-6)
- `.section-spacing-large` - Större mellanrum (mb-12)

### Kort-styling
- `.content-card` - Standard kort (p-6, rounded-xl, shadow-sm)
- `.content-card-compact` - Kompakt kort (p-4, rounded-xl, shadow-sm)

## Användning

### Exempel på konsekvent layout:
```tsx
<div className="content-container">
  <h1 className="text-h1 section-spacing">Sidtitel</h1>
  
  <div className="content-card section-spacing">
    <h2 className="text-h2 section-spacing-small">Sektionsrubrik</h2>
    <p className="text-body">Brödtext...</p>
  </div>
  
  <div className="content-card-compact section-spacing">
    <h3 className="text-h3 section-spacing-small">Undersektion</h3>
    <p className="text-body-small">Mindre text...</p>
  </div>
</div>
```

## Färger

### Primära färger
- `var(--tenant-brand)` - Primär varumärkesfärg (sidebar)
- `#f5f7fa` - Bakgrundsgrå
- `text-gray-900` - Mörk text (rubriker)
- `text-gray-700` - Standard text
- `text-gray-500` - Ljusare text (labels, hjälptext)

## Komponenter

### Header
- Konsekvent höjd: `h-20`
- Backdrop blur: `bg-white/95 backdrop-blur-sm`
- Skugga: `shadow-sm`

### Sidebar
- Fast bredd: `w-[280px]`
- Primär brandfärg: `bg-[var(--tenant-brand)]`
- Hover-effekter med scale och translate

### Profil-sektion
- Gradient bakgrund: `from-green-100 to-green-200`
- Hover med gradient: `hover:from-gray-50 hover:to-gray-100`
- Pil-ikon som visas vid hover
