<?php
declare(strict_types=1);

namespace OCA\NextLibrary\Service;

/**
 * Sunucu tarafı HTML temizleyici. İstemcideki js/app.js `sanitize()` mantığının
 * birebir karşılığı — API'ye doğrudan gönderilen (istemci baypas edilen) içerikte
 * stored-XSS'i engeller. Bağımlılık yok: DOMDocument + beyaz liste.
 */
class HtmlSanitizer {

    /** İçeriğiyle birlikte tamamen kaldırılan etiketler. */
    private const DROP = [
        'SCRIPT' => 1, 'STYLE' => 1, 'OBJECT' => 1, 'EMBED' => 1, 'LINK' => 1,
        'META' => 1, 'FORM' => 1, 'INPUT' => 1, 'BUTTON' => 1, 'TEXTAREA' => 1,
        'SELECT' => 1, 'SVG' => 1, 'MATH' => 1, 'BASE' => 1,
    ];

    /** İzin verilen etiketler (dışındakiler "unwrap" edilir: içerik kalır, etiket düşer). */
    private const SAFE = [
        'P' => 1, 'BR' => 1, 'B' => 1, 'STRONG' => 1, 'I' => 1, 'EM' => 1, 'U' => 1,
        // STRIKE: tarayıcının strikeThrough çıktısı (<s> değil) — istemci listesiyle parite şart.
        'S' => 1, 'STRIKE' => 1, 'H1' => 1, 'H2' => 1, 'H3' => 1, 'H4' => 1, 'UL' => 1, 'OL' => 1,
        'LI' => 1, 'BLOCKQUOTE' => 1, 'A' => 1, 'IMG' => 1, 'SPAN' => 1, 'DIV' => 1,
        'CODE' => 1, 'PRE' => 1, 'HR' => 1, 'TABLE' => 1, 'THEAD' => 1, 'TBODY' => 1,
        'TR' => 1, 'TD' => 1, 'TH' => 1, 'VIDEO' => 1, 'SOURCE' => 1, 'IFRAME' => 1,
        'FIGURE' => 1, 'FIGCAPTION' => 1,
    ];

    /** URL taşıyanlar dışında izin verilen öznitelikler. */
    private const ALLOW = [
        'class' => 1, 'alt' => 1, 'title' => 1, 'target' => 1, 'rel' => 1,
        'colspan' => 1, 'rowspan' => 1, 'controls' => 1, 'type' => 1, 'width' => 1,
        'height' => 1, 'playsinline' => 1, 'poster' => 1,
    ];

    /** IFRAME için izin verilen öznitelikler (yalnızca video gömme). */
    private const IFRAME_ATTR = [
        'src' => 1, 'width' => 1, 'height' => 1, 'allow' => 1, 'allowfullscreen' => 1,
        'frameborder' => 1, 'loading' => 1, 'title' => 1, 'class' => 1, 'referrerpolicy' => 1,
    ];

    private const URL_OK = '#^\s*(https?:|mailto:|/|\#|data:image/(png|jpe?g|gif|webp|svg\+xml);)#i';
    private const EMBED_RE = '#^https://((www\.)?youtube-nocookie\.com/embed/|(www\.)?youtube\.com/embed/|player\.vimeo\.com/video/)#i';

    public function clean(string $html): string {
        if (trim($html) === '') {
            return '';
        }
        $doc = new \DOMDocument('1.0', 'UTF-8');
        $prev = libxml_use_internal_errors(true);
        // UTF-8 koru; fragman <html><body>...</body></html> içine sarılır
        $doc->loadHTML('<?xml encoding="utf-8"?>' . $html, LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);

        $body = $doc->getElementsByTagName('body')->item(0);
        if ($body === null) {
            return '';
        }
        $this->cleanNode($body);

        $out = '';
        foreach (iterator_to_array($body->childNodes) as $child) {
            $out .= $doc->saveHTML($child);
        }
        return $out;
    }

    private function cleanNode(\DOMNode $node): void {
        foreach (iterator_to_array($node->childNodes) as $child) {
            if ($child->nodeType === XML_COMMENT_NODE) {
                $node->removeChild($child);
                continue;
            }
            if ($child->nodeType !== XML_ELEMENT_NODE) {
                continue; // metin düğümleri korunur
            }
            /** @var \DOMElement $child */
            $tag = strtoupper($child->tagName);

            if (isset(self::DROP[$tag])) {
                $node->removeChild($child);
                continue;
            }
            if ($tag === 'IFRAME') {
                $src = $child->getAttribute('src');
                if (!preg_match(self::EMBED_RE, $src)) {
                    $node->removeChild($child);
                    continue;
                }
                $this->filterAttrs($child, self::IFRAME_ATTR, true);
                $child->setAttribute('allowfullscreen', '');
                $child->setAttribute('loading', 'lazy');
                $child->setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                continue;
            }
            if (!isset(self::SAFE[$tag])) {
                // güvenli değil → önce içeriğini temizle, sonra etiketi kaldırıp çocukları yukarı taşı
                $this->cleanNode($child);
                $this->unwrap($child);
                continue;
            }
            // güvenli etiket → öznitelikleri süz + <a> için target/rel zorla + alt ağacı temizle
            $this->filterAttrs($child, self::ALLOW, false);
            if ($tag === 'A') {
                $child->setAttribute('target', '_blank');
                $child->setAttribute('rel', 'noopener noreferrer');
            }
            $this->cleanNode($child);
        }
    }

    private function filterAttrs(\DOMElement $el, array $allow, bool $isIframe): void {
        $names = [];
        foreach (iterator_to_array($el->attributes) as $a) {
            $names[] = $a->nodeName;
        }
        foreach ($names as $name) {
            $l = strtolower($name);
            if ($isIframe) {
                if (!isset($allow[$l])) {
                    $el->removeAttribute($name);
                }
                continue;
            }
            if ($l === 'href' || $l === 'src' || $l === 'poster') {
                if (!preg_match(self::URL_OK, $el->getAttribute($name))) {
                    $el->removeAttribute($name);
                }
                continue;
            }
            if (!isset($allow[$l])) {
                $el->removeAttribute($name);
            }
        }
    }

    private function unwrap(\DOMElement $el): void {
        $parent = $el->parentNode;
        if ($parent === null) {
            return;
        }
        while ($el->firstChild !== null) {
            $parent->insertBefore($el->firstChild, $el);
        }
        $parent->removeChild($el);
    }
}
