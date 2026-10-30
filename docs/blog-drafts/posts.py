# Four blog drafts for dripemporium.store. Body is the blog's plain HTML (h2, h3, p, ul, ol, li, a, strong).
# Prices in the pricing post are live catalogue figures as of 2026-10-31; the post says so and links to the live pages.

POSTS = []

def post(slug, title, excerpt, body):
    POSTS.append({"slug": slug, "title": title, "excerpt": excerpt, "body": "".join(line.strip() for line in body.strip().splitlines())})

post(
"sneaker-shops-ronald-ngala-street-nairobi",
"Buying Sneakers on Ronald Ngala Street, Nairobi",
"Ronald Ngala Street is one of Nairobi CBD's busiest places to buy shoes. Here's how to shop it well: what to check, how to compare, and how to pay.",
"""
<p>Ask a Nairobian where to buy shoes in town and Ronald Ngala Street comes up fast. It's one of the CBD streets known for footwear, with shops, malls and traders selling everything from school shoes to the latest sneakers. That choice is a good thing for a buyer, but it also means it pays to know how to shop it.</p>
<p>This guide is for anyone planning a trip to Ronald Ngala Street for sneakers, whichever shop you end up buying from. Full disclosure: Drip Emporium is on this street, in Dubai Merchants Mall, so we see every day what makes a good buying trip and what doesn't.</p>

<h2>Before you leave home</h2>
<ul>
<li><strong>Know your size.</strong> Many sneakers in Kenya are sold in EUR sizes (we stock EUR 36 to 46). If you're unsure, measure your foot against a ruler in the evening, when feet are largest, and check our <a href="/blog/sneaker-size-guide-kenya">sneaker size guide</a>.</li>
<li><strong>Decide what you want.</strong> A rough idea of the model, colour and budget saves time and keeps you from being talked into something else.</li>
<li><strong>Go in daylight, and travel light.</strong> The CBD is busy. Keep your phone and wallet secure, and carry only what you need.</li>
<li><strong>Charge your phone.</strong> You'll want it for M-Pesa, for photos of what you're comparing, and for looking up a model.</li>
</ul>

<h2>Compare before you commit</h2>
<p>Walk the street and look at the same model in two or three places before buying. Ask for the price on the pair itself, then compare like with like: same model, same colourway, same size. A pair that is much cheaper than everywhere else deserves a question, not a purchase. Our guide to <a href="/blog/how-to-spot-fake-sneakers">spotting fake sneakers</a> explains what to look at.</p>

<h2>Always try both shoes on</h2>
<p>One shoe on the shelf tells you very little. Ask to try on both, lace them up properly, and walk a few steps. Check that:</p>
<ul>
<li>the size label inside matches what you asked for;</li>
<li>both shoes are the same size, shape and colour;</li>
<li>there's room for your toes, and nothing pinches across the widest part of your foot;</li>
<li>the sole is clean and the stitching is even.</li>
</ul>
<p>At Drip Emporium you can try pairs on and pay only if they fit. Whichever shop you choose, make that your rule: don't pay for shoes you haven't worn.</p>

<h2>Prices and bargaining</h2>
<p>Many traders in Nairobi expect some discussion on price. A fair approach is to ask the marked price first, say what you've seen elsewhere, and see whether there's room. Be wary of a price that collapses the moment you hesitate: it makes it hard to know what a fair price actually is, so go back to comparing the same pair elsewhere.</p>

<h2>Paying safely</h2>
<ul>
<li>Confirm the total before you pay, and confirm it again on your M-Pesa prompt.</li>
<li>Check the business or till name shown before you enter your PIN.</li>
<li>Never share your M-Pesa PIN or a one-time code with anyone, including someone who says they are helping you pay.</li>
<li>Keep the M-Pesa confirmation message and, where you can, a receipt.</li>
</ul>

<h2>Ask about exchanges before you pay</h2>
<p>Wrong size? Ask what the shop does about it before you hand over money. At Drip Emporium, unworn shoes in their original box are the easiest to exchange, and we'd rather swap a size than leave you with shoes you won't wear. Whatever the shop's policy is, get it clearly, keep the box, and keep the receipt.</p>

<h2>Can't make it into town?</h2>
<p>You can still shop from home. We deliver countrywide, and the cost depends on where the parcel is going, so we confirm it with you after you order. See <a href="/blog/how-to-buy-sneakers-online-in-kenya-safely">how to buy sneakers online in Kenya safely</a> for what to check.</p>

<h2>Find us</h2>
<p>Drip Emporium is at Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD, open every day from 08:00 to 20:00. Tell us the shoe and your size on WhatsApp before you come and we'll tell you straight away whether it's on the shelf. Browse what we stock on our <a href="/shop">shop page</a>, or see <a href="/contact">how to reach us</a>.</p>
""")

post(
"how-to-buy-sneakers-online-in-kenya-safely",
"How to Buy Sneakers Online in Kenya Safely",
"Buying sneakers online in Kenya doesn't have to be a gamble. Check the seller, get your size right, pay safely, and inspect the pair when it arrives.",
"""
<p>Buying sneakers online is convenient, especially if you can't get into town. It's also where most bad experiences happen: the wrong size, a pair that isn't what the photos showed, or money sent to someone who then disappears. A few habits remove most of that risk.</p>

<h2>1. Check the seller is real</h2>
<p>Before you order, look for signs that there's a real business behind the page:</p>
<ul>
<li>a physical address you could actually visit, and opening hours;</li>
<li>a phone or WhatsApp number that gets answered, and the same details everywhere (website, Instagram, Google);</li>
<li>photos that are clearly the seller's own, not stock images or pictures copied from elsewhere;</li>
<li>written policies for delivery and exchanges that you can read before paying.</li>
</ul>
<p>If the only way to reach a seller is a number that never replies, that tells you what you need to know.</p>

<h2>2. Get your size right</h2>
<p>Sizing is the most common reason for returns. Many pairs are sold in EUR sizes, but fit varies by brand and model, and some run small or large. Measure your foot, read our <a href="/blog/sneaker-size-guide-kenya">sneaker size guide</a>, and ask the seller if the model fits true to size. Also ask whether your size is on the shelf or has to be sourced, and how long that takes. An honest seller will tell you.</p>

<h2>3. Ask to see the actual pair</h2>
<p>A quick photo or video of the exact pair, in your size, sent on WhatsApp, costs the seller a minute and saves you a lot of doubt. Look at the box label, the size tag inside the tongue, the stitching and the sole. If a seller won't show you, think twice. For what to look for, see <a href="/blog/how-to-spot-fake-sneakers">how to spot fake sneakers</a>.</p>

<h2>4. Know the total cost before you pay</h2>
<p>The shoe price is only part of it. Ask what delivery will cost and how long it will take to reach you, before you pay anything. Delivery cost depends on where the parcel is going, so a seller who quotes a delivery price without asking where you are may be leaving something out. At Drip Emporium delivery isn't added at checkout for exactly this reason: we call you after you order to confirm the cost. More on our <a href="/delivery">delivery page</a>.</p>

<h2>5. Pay in a way that protects you</h2>
<ul>
<li><strong>Use a proper checkout where you can.</strong> A card or M-Pesa checkout through an established payment provider is safer than sending money to an individual's number.</li>
<li><strong>Check the name</strong> shown on your M-Pesa prompt matches the business you're buying from.</li>
<li><strong>Be careful with deposits.</strong> Being asked to send money to a personal number for an order you've never seen anything from is a classic warning sign.</li>
<li><strong>Never share your M-Pesa PIN or a one-time code,</strong> for any reason, with anyone.</li>
<li><strong>Prefer pay on collection</strong> if you're able to pick up from the shop.</li>
<li>Keep the payment confirmation message and any chat history.</li>
</ul>

<h2>6. Inspect the pair when it arrives</h2>
<p>Check the parcel while the courier is still there if you can, or as soon as you get it. Look for:</p>
<ul>
<li>the right model and colour, and the size you ordered;</li>
<li>both shoes matching, with no visible damage or marks;</li>
<li>the box and any tags intact.</li>
</ul>
<p>Take a short video as you open the box. If something is wrong, contact the seller the same day with photos. Don't wear the shoes outside until you're happy with them: unworn pairs in their original box are far easier to exchange.</p>

<h2>7. Ask about exchanges before you order</h2>
<p>A good seller will tell you how exchanges work before you pay. At Drip Emporium you can message us on WhatsApp as soon as you can if a pair isn't right, and unworn shoes in their original box are the easiest to swap. We'd rather sort out a wrong size than leave you with shoes you won't wear.</p>

<h2>Warning signs, in short</h2>
<ul>
<li>A price far below every other seller's for the same model.</li>
<li>No address, no landline, and a number that doesn't answer.</li>
<li>Pressure to pay quickly, or to pay into a personal number.</li>
<li>No clear answer on delivery cost or exchanges.</li>
<li>A seller who won't send a photo of the actual pair.</li>
</ul>

<h2>Prefer to check in person?</h2>
<p>If you're in Nairobi, you can try pairs on at the shop first: Dubai Merchants Mall, Shop F53, Ronald Ngala Street, open every day from 08:00 to 20:00. Not nearby? <a href="/shop">Browse the full range</a> and message us on WhatsApp with the shoe and your size. We answer, and we'll tell you honestly what's on the shelf and what we'd have to order.</p>
""")

post(
"how-much-do-sneakers-cost-in-kenya",
"How Much Do Sneakers Cost in Kenya? A 2026 Price Guide",
"What sneakers cost in Kenya in 2026: real price ranges by brand and popular model from a Nairobi shop, and why the cheapest pair isn't always the deal.",
"""
<p>"How much are sneakers in Kenya?" has no single answer, because a pair of Air Force 1s and a limited-edition collaboration sit in different worlds. But it does help to have a realistic range in your head before you start shopping. Here's what we charge at Drip Emporium in Nairobi, so you can sense-check any price you're quoted.</p>
<p><strong>A note on the numbers:</strong> these are our real prices as of 31 October 2026, in Kenyan shillings (KSh). Prices change as stock does, so for today's price follow the links to our live pages.</p>

<h2>Sneakers by type, at a glance</h2>
<ul>
<li><strong>Sneakers:</strong> KSh 2,000 to KSh 5,000</li>
<li><strong>Casual shoes:</strong> KSh 2,300 to KSh 3,500</li>
<li><strong>Official (formal) shoes:</strong> KSh 3,500 to KSh 4,500</li>
<li><strong>Ladies' shoes:</strong> KSh 2,700 to KSh 5,000</li>
<li><strong>Watches:</strong> KSh 3,000 to KSh 7,500</li>
</ul>
<p>Across everything we stock, the cheapest pair starts at KSh 2,000.</p>

<h2>Sneaker prices by brand</h2>
<ul>
<li><strong><a href="/shop/brand/nike">Nike</a>:</strong> from KSh 2,000 to KSh 4,200</li>
<li><strong><a href="/shop/brand/adidas">Adidas</a>:</strong> from KSh 3,000 to KSh 3,700</li>
<li><strong><a href="/shop/brand/new-balance">New Balance</a>:</strong> from KSh 3,500 to KSh 4,500</li>
<li><strong><a href="/shop/brand/jordan">Jordan</a>:</strong> from KSh 3,500 to KSh 3,800</li>
<li><strong><a href="/shop/brand/converse">Converse</a>:</strong> KSh 2,300</li>
</ul>

<h2>Popular models and what they cost</h2>
<ul>
<li><strong><a href="/shop/collection/air-force-1">Nike Air Force 1</a>:</strong> from KSh 2,000 for the classic all-white and all-black pairs, up to roughly KSh 3,700 for special and custom editions.</li>
<li><strong><a href="/shop/collection/air-max">Nike Air Max</a>:</strong> about KSh 3,700 to KSh 4,200, depending on the model.</li>
<li><strong><a href="/shop/collection/jordan-4">Air Jordan 4</a>:</strong> KSh 3,500 to KSh 3,800.</li>
<li><strong><a href="/shop/collection/nike-dunk">Nike Dunk</a>:</strong> KSh 3,500 to KSh 3,800.</li>
<li><strong><a href="/shop/collection/nike-tn">Nike Air Max TN</a>:</strong> around KSh 3,800.</li>
<li><strong><a href="/shop/collection/adidas-stan-smith">Adidas Stan Smith</a>:</strong> around KSh 3,000.</li>
<li><strong><a href="/shop/collection/adidas-campus">Adidas Campus</a>:</strong> around KSh 3,500.</li>
</ul>

<h2>What makes one pair cost more than another</h2>
<ul>
<li><strong>The model and its demand.</strong> Pairs people are chasing cost more than long-running staples.</li>
<li><strong>Special editions.</strong> Custom colourways and collaborations carry a premium over the standard colours of the same shoe.</li>
<li><strong>Materials and build.</strong> Leather, suede and layered, technical uppers cost more to make than simple canvas or mesh.</li>
<li><strong>Whether it's on the shelf.</strong> A pair that has to be sourced for you in your size can differ in price from one that's in stock.</li>
<li><strong>The seller.</strong> A shop with a real address, real stock and clear policies has costs a pop-up seller doesn't.</li>
</ul>

<h2>Why the cheapest pair isn't always the deal</h2>
<p>If a price is far below what everyone else charges for the same model, ask why before you celebrate. Counterfeits are a real risk in Kenya, and an unusually low price is the first thing to question. Read <a href="/blog/how-to-spot-fake-sneakers">how to spot fake sneakers</a> and, wherever you buy, try the pair on and inspect it before you pay.</p>

<h2>How to compare prices fairly</h2>
<ol>
<li><strong>Same model, same colourway, same size.</strong> Compare exactly the same pair.</li>
<li><strong>Add delivery.</strong> The total is what counts. We confirm delivery cost with you after you order, since it depends on where the parcel is going (see our <a href="/delivery">delivery page</a>).</li>
<li><strong>Ask about exchanges.</strong> A slightly cheaper pair you can't swap if it doesn't fit isn't a saving.</li>
<li><strong>Check you can inspect it.</strong> The ability to try before you pay is worth something.</li>
</ol>

<h2>Starting on a budget</h2>
<p>If you're building a first collection, start with pairs that go with everything: an all-white Air Force 1, a Converse or a Stan Smith. Our guide to <a href="/blog/sneaker-rotation-on-a-budget">building a sneaker rotation without overspending</a> shows how to add pairs sensibly. You can also <a href="/shop">browse everything we stock</a>, and message us on WhatsApp with the model and size you want if you'd like to check availability.</p>
""")

post(
"protect-sneakers-nairobi-rainy-season",
"How to Protect Your Sneakers in Nairobi's Rainy Season",
"Nairobi's short rains run October to December. Here's how to keep your sneakers looking good: what to wear when it's wet, and how to dry them without damage.",
"""
<p>Nairobi has two rainy seasons: the long rains, roughly March to May, and the short rains, roughly October to December. If you're wearing sneakers around the CBD right now, you've probably already met a puddle or two. Water doesn't have to ruin a good pair, but a few habits make a big difference.</p>

<h2>Wear the right pair for the weather</h2>
<p>Different materials cope with wet very differently:</p>
<ul>
<li><strong>Smooth leather</strong> handles splashes well and wipes clean, and is a good rainy-day choice.</li>
<li><strong>Suede and nubuck</strong> mark easily and can stain and stiffen when soaked. Keep them for dry days.</li>
<li><strong>White and light mesh</strong> soak up dirty water and show every mark. They're better saved for sunny days.</li>
<li><strong>Waterproof membrane pairs,</strong> such as some Gore-Tex models, are made for wet weather. Ask us if you're looking for one.</li>
</ul>
<p>Chunkier soles with deep tread also grip wet pavements better than flat, smooth ones. That's worth thinking about on the busy pavements of town.</p>

<h2>Protect them before you go out</h2>
<p>A waterproofing or protector spray gives the surface a head start against water and stains. Test it on a small hidden area first, spray in a ventilated place, let it dry fully before wearing, and reapply every few weeks in rainy season. Suede needs a spray made for suede.</p>

<h2>Dry them properly (and don't rush it)</h2>
<p>How you dry a wet pair matters more than how you wash it. Do this:</p>
<ol>
<li>Take out the laces and insoles so they dry separately.</li>
<li>Stuff the shoes loosely with plain paper or paper towels to draw out the water. Avoid newspaper on light-coloured pairs, because the ink can transfer.</li>
<li>Change the paper after a few hours when it's soaked, until the inside is dry.</li>
<li>Leave them somewhere ventilated, out of direct sun.</li>
</ol>
<p>Avoid heaters, hairdryers and a hot car. Strong heat can warp the shape, crack leather and weaken the glue that holds soles on. Never put sneakers in a tumble dryer.</p>

<h2>Clean the mud once it's dry</h2>
<p>Let mud dry first, then brush it off with a soft brush. Wipe what's left with a damp cloth and a little mild soap. For more, see our guides to <a href="/blog/how-to-clean-white-sneakers">cleaning white sneakers</a> and <a href="/blog/leather-suede-care-guide">caring for leather and suede</a>.</p>

<h2>Condition leather afterwards</h2>
<p>Leather that's been wet and dried can feel stiff. Once the pair is fully dry, a little leather conditioner keeps it supple and helps prevent cracking.</p>

<h2>Rotate your pairs</h2>
<p>Wearing the same pair every day in wet weather never gives it time to dry out, which wears it faster and can leave it smelling. Having two or three pairs to alternate lets each one dry for a full day or two. We explain how to build a small collection without overspending in <a href="/blog/sneaker-rotation-on-a-budget">our rotation guide</a>.</p>

<h2>Don't store them damp</h2>
<p>A damp pair shut in a box or a bag can grow mould and smell. Make sure shoes are completely dry before you put them away.</p>

<h2>Looking for a rainy-season pair?</h2>
<p>Tell us how you get around and what you want to wear on wet days, and we'll point you to something that suits. You can <a href="/shop">browse our range</a> or message us on WhatsApp. We're at Dubai Merchants Mall, Shop F53, Ronald Ngala Street, open every day from 08:00 to 20:00.</p>
""")

if __name__ == "__main__":
    import re
    for p in POSTS:
        words = len(re.sub(r"<[^>]+>", " ", p["body"]).split())
        print(f'{p["slug"]:48} {words:4d} words | excerpt {len(p["excerpt"])} chars | title {len(p["title"])} chars')
