export const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Example Comps</title>
  <link>https://comps.example.co.uk</link>
  <item>
    <title>WIN a £500 Argos gift card! | Example Comps</title>
    <link>https://comps.example.co.uk/argos-500/?utm_source=rss&amp;utm_medium=feed</link>
    <description><![CDATA[<p>Fill in the online form to enter. Closes 9th October 2026.</p>]]></description>
    <category>Online</category>
    <category>Vouchers</category>
    <pubDate>Mon, 05 Oct 2026 09:00:00 +0100</pubDate>
  </item>
  <item>
    <title>Win a family holiday to Florida</title>
    <link>https://comps.example.co.uk/florida#comments</link>
    <description>Follow us on Instagram, like &amp; share the post and tag a friend. Competition ends 31/12/2026 at 5pm.</description>
    <category>Instagram</category>
  </item>
  <item>
    <title>Win a Nintendo Switch 2 – enter daily</title>
    <link>https://comps.example.co.uk/switch</link>
    <description>Enter once a day for more chances. Deadline: Friday 16 October.</description>
  </item>
  <item>
    <title>Win a hamper of cheese and wine</title>
    <link>https://comps.example.co.uk/hamper</link>
    <description>Send a postcard to PO Box 123, London. Closing date 1 October 2026.</description>
  </item>
  <item>
    <title>Win £1,000 cash</title>
    <guid isPermaLink="true">https://comps.example.co.uk/cash-1000</guid>
    <description>Email your answer to comps@example.co.uk. Weekly draw.</description>
    <closingDate>2026-11-30</closingDate>
  </item>
  <item>
    <title>Win the Argos gift card again</title>
    <link>https://COMPS.example.co.uk/argos-500</link>
    <description>Duplicate of the first item.</description>
  </item>
  <item>
    <title></title>
    <link>https://comps.example.co.uk/untitled</link>
  </item>
</channel>
</rss>`;

export const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Comps</title>
  <entry>
    <title type="html">Competition: Win tickets to a West End show</title>
    <link rel="replies" href="https://atom.example.com/show/comments"/>
    <link rel="alternate" href="https://atom.example.com/show"/>
    <summary>Answer the question to enter. Closes at midnight on 20th November.</summary>
    <category term="Experiences"/>
    <updated>2026-10-01T12:00:00Z</updated>
  </entry>
</feed>`;

export const RDF_FEED = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel><title>RDF Comps</title></channel>
  <item>
    <title>Win an iPad Air</title>
    <link>https://rdf.example.com/ipad</link>
    <description>Ends 2026-12-01.</description>
    <dc:subject>Tech</dc:subject>
    <dc:date>2026-10-02T08:00:00Z</dc:date>
  </item>
</rdf:RDF>`;

export const HTML_PAGE = `<!DOCTYPE html><html><head><title>Not a feed</title></head><body>Hi</body></html>`;
