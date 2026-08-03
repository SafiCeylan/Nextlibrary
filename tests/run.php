<?php
declare(strict_types=1);

/**
 * NextLibrary — bağımlılıksız test koşucusu.
 *
 * Composer/PHPUnit YOK: proje hiçbir build adımı taşımıyor, testi de taşımasın.
 * Yalnızca ext-dom gerekir (PHP ile birlikte gelir).
 *
 * Çalıştırma (PHP kuruluysa, app kökünden):
 *   php tests/run.php
 * PHP yoksa, yalnızca Docker ile (app klasörünü bağlar, hiçbir şey kurmaz):
 *   docker run --rm -v "%CD%:/app" -w /app php:8.3-cli php tests/run.php     (Windows)
 *   docker run --rm -v "$PWD:/app"  -w /app php:8.3-cli php tests/run.php     (Linux/macOS)
 *
 * Kapsam: Nextcloud'a bağımlı OLMAYAN parçalar.
 *   1) HtmlSanitizer davranışı — stored-XSS'e karşı son savunma hattı.
 *   2) PHP ↔ JS beyaz liste PARİTESİ — iki liste ayrışırsa istemcide temizlenen bir
 *      şey sunucuda geçebilir (ya da tersi sessizce içerik yer). Bu kontrol, CLAUDE.md'de
 *      "parite şart" diye yazılı kuralı makineye bağlar.
 *
 * Controller/Mapper testleri buraya GİRMEZ: OCP sınıflarını ve bir NC test bootstrap'ını
 * gerektirirler; onlar ancak gerçek bir Nextcloud geliştirme kurulumunda çalışır.
 */

require_once __DIR__ . '/../lib/Service/HtmlSanitizer.php';

use OCA\NextLibrary\Service\HtmlSanitizer;

// ───────────────────────── küçük koşucu ─────────────────────────

$passed = 0;
$failures = [];

function ok(bool $cond, string $label, string $detail = ''): void {
    global $passed, $failures;
    if ($cond) {
        $passed++;
        return;
    }
    $failures[] = $label . ($detail !== '' ? "\n      " . $detail : '');
}

function same(string $expected, string $actual, string $label): void {
    ok($expected === $actual, $label, "beklenen: " . var_export($expected, true) . "\n      gelen   : " . var_export($actual, true));
}

function has(string $needle, string $haystack, string $label): void {
    ok(strpos($haystack, $needle) !== false, $label, "'$needle' bulunamadı içinde: " . var_export($haystack, true));
}

function hasNot(string $needle, string $haystack, string $label): void {
    ok(strpos($haystack, $needle) === false, $label, "'$needle' KALDI içinde: " . var_export($haystack, true));
}

function section(string $name): void {
    echo "\n── $name\n";
}

// ───────────────────────── 1) HtmlSanitizer ─────────────────────────

$s = new HtmlSanitizer();

section('HtmlSanitizer — temel');

same('', $s->clean(''), 'boş girdi boş döner');
same('', $s->clean('   '), 'yalnızca boşluk boş döner');
same('<p>merhaba</p>', $s->clean('<p>merhaba</p>'), 'izinli etiket korunur');
same('<p>ab</p>', $s->clean('<p>a<!-- yorum -->b</p>'), 'HTML yorumu silinir');

// Türkçe içerik bozulmamalı. DOMDocument çıktıyı entity olarak da verebilir
// (&#350; gibi) — ikisi de kabul, çözüldüğünde metin aynı kalmalı.
$tr = $s->clean('<p>Şığüöç İstanbul</p>');
has('Şığüöç İstanbul', html_entity_decode($tr, ENT_QUOTES | ENT_HTML5, 'UTF-8'), 'Türkçe karakterler korunur');

section('HtmlSanitizer — tamamen atılan etiketler');

hasNot('alert', $s->clean('<script>alert(1)</script><p>ok</p>'), 'script içeriğiyle birlikte gider');
has('<p>ok</p>', $s->clean('<script>alert(1)</script><p>ok</p>'), 'script gidince komşu içerik kalır');
hasNot('body{', $s->clean('<style>body{color:red}</style><p>a</p>'), 'style içeriğiyle birlikte gider');
same('', $s->clean('<svg onload="alert(1)"></svg>'), 'svg atılır');
same('', $s->clean('<form><input name="x"></form>'), 'form/input atılır');
same('<p>ab</p>', $s->clean('<p>a<script>x</script>b</p>'), 'izinli etiketin İÇİNDEKİ script de gider');

section('HtmlSanitizer — bilinmeyen etiket açılır (içerik kalır)');

same('merhaba', $s->clean('<marquee>merhaba</marquee>'), 'bilinmeyen etiket unwrap edilir');
same('bar', $s->clean('<foo><script>x</script>bar</foo>'), 'unwrap ÖNCE içi temizlenir');

section('HtmlSanitizer — öznitelikler');

same('<b>t</b>', $s->clean('<b onclick="evil()">t</b>'), 'olay özniteliği silinir');
$span = $s->clean('<span class="cal" style="color:red" data-x="1">t</span>');
has('class="cal"', $span, 'izinli öznitelik (class) kalır');
hasNot('style=', $span, 'style özniteliği silinir');
hasNot('data-x', $span, 'bilinmeyen öznitelik silinir');

section('HtmlSanitizer — URL şemaları');

$a = $s->clean('<a href="javascript:alert(1)">x</a>');
hasNot('javascript:', $a, 'javascript: href silinir');
$a2 = $s->clean('<a href="https://example.com">x</a>');
has('href="https://example.com"', $a2, 'https href korunur');
has('target="_blank"', $a2, '<a> için target zorlanır');
has('rel="noopener noreferrer"', $a2, '<a> için rel zorlanır');
has('href="mailto:a@b.c"', $s->clean('<a href="mailto:a@b.c">x</a>'), 'mailto korunur');
has('href="/apps/x"', $s->clean('<a href="/apps/x">x</a>'), 'kök-göreli bağlantı korunur');
has('data:image/png', $s->clean('<img src="data:image/png;base64,AAAA" alt="">'), 'data:image korunur');
hasNot('data:text/html', $s->clean('<img src="data:text/html;base64,AAAA">'), 'data:text/html silinir');
hasNot('javascript:', $s->clean('<video poster="javascript:x" src="https://a.b/c.mp4" controls></video>'), 'poster da URL denetiminden geçer');

section('HtmlSanitizer — iframe (yalnızca video gömme)');

$yt = $s->clean('<iframe src="https://www.youtube-nocookie.com/embed/abcdefghijk"></iframe>');
has('youtube-nocookie.com/embed/abcdefghijk', $yt, 'youtube-nocookie embed korunur');
has('allowfullscreen', $yt, 'allowfullscreen zorlanır');
has('loading="lazy"', $yt, 'loading=lazy zorlanır');
has('referrerpolicy="strict-origin-when-cross-origin"', $yt, 'referrerpolicy zorlanır (YouTube 153 hatası)');
has('player.vimeo.com/video/123', $s->clean('<iframe src="https://player.vimeo.com/video/123"></iframe>'), 'vimeo embed korunur');
same('', $s->clean('<iframe src="https://evil.example/x"></iframe>'), 'listede olmayan iframe atılır');
same('', $s->clean('<iframe src="https://www.youtube.com/watch?v=abcdefghijk"></iframe>'), '/embed/ olmayan youtube adresi atılır');
hasNot('onload', $s->clean('<iframe src="https://www.youtube.com/embed/abcdefghijk" onload="evil()"></iframe>'), 'iframe üzerindeki olay özniteliği silinir');

section('HtmlSanitizer — biçim etiketleri');

has('<strike>', $s->clean('<strike>x</strike>'), 'STRIKE korunur (tarayıcı strikeThrough çıktısı)');
has('<s>', $s->clean('<s>x</s>'), 'S korunur');
has('<blockquote>', $s->clean('<blockquote>x</blockquote>'), 'blockquote korunur');
has('<pre>', $s->clean('<pre><code>x</code></pre>'), 'pre/code korunur');

// ─────────────── 2) PHP ↔ JS beyaz liste paritesi ───────────────

section('PHP ↔ JS parite (HtmlSanitizer.php ↔ js/app.js)');

$jsSource = @file_get_contents(__DIR__ . '/../js/app.js');
if ($jsSource === false) {
    ok(false, 'js/app.js okunabilir');
} else {
    /** js kaynağındaki `const NAME=new Set([...])` içeriğini çıkarır. */
    $jsSet = static function (string $js, string $name): array {
        if (!preg_match('/const\s+' . preg_quote($name, '/') . '\s*=\s*new Set\(\[(.*?)\]\)/s', $js, $m)) {
            return [];
        }
        preg_match_all("/'([^']*)'/", $m[1], $items);
        return $items[1];
    };

    $consts = (new ReflectionClass(HtmlSanitizer::class))->getConstants();

    /** İki listeyi sıra/harf farkını yok sayarak karşılaştırır, farkı raporlar. */
    $cmp = static function (array $php, array $js, string $label, bool $upper): void {
        $norm = static function (array $a) use ($upper): array {
            return array_values(array_unique(array_map($upper ? 'strtoupper' : 'strtolower', $a)));
        };
        $p = $norm($php);
        $j = $norm($js);
        sort($p);
        sort($j);
        $onlyPhp = array_diff($p, $j);
        $onlyJs = array_diff($j, $p);
        $detail = '';
        if ($onlyPhp) {
            $detail .= 'yalnızca PHP: ' . implode(', ', $onlyPhp) . '  ';
        }
        if ($onlyJs) {
            $detail .= 'yalnızca JS: ' . implode(', ', $onlyJs);
        }
        ok($p === $j, $label, $detail);
    };

    $cmp(array_keys($consts['SAFE']), $jsSet($jsSource, 'SAFE_TAGS'), 'izinli etiket listeleri aynı', true);
    $cmp(array_keys($consts['DROP']), $jsSet($jsSource, 'DROP_TAGS'), 'atılan etiket listeleri aynı', true);
    $cmp(array_keys($consts['ALLOW']), $jsSet($jsSource, 'ALLOW_ATTR'), 'izinli öznitelik listeleri aynı', false);
    $cmp(array_keys($consts['IFRAME_ATTR']), $jsSet($jsSource, 'IFRAME_ATTR'), 'iframe öznitelik listeleri aynı', false);

    // Listelerin gerçekten okunabildiğini doğrula (regex kayarsa boş küme sessizce "eşit" görünürdü).
    ok(count($jsSet($jsSource, 'SAFE_TAGS')) > 10, 'js SAFE_TAGS ayrıştırılabildi');
    ok(count($jsSet($jsSource, 'DROP_TAGS')) > 5, 'js DROP_TAGS ayrıştırılabildi');
}

// ───────────────────────── sonuç ─────────────────────────

echo "\n";
if (empty($failures)) {
    echo "✔ {$passed} test geçti\n";
    exit(0);
}
echo "✘ " . count($failures) . " test BAŞARISIZ ({$passed} geçti)\n\n";
foreach ($failures as $i => $f) {
    echo '  ' . ($i + 1) . ") $f\n";
}
exit(1);
