import type { Food, Nutrients, Serving } from '../types'
import { emptyNutrients } from '../lib/nutrition'

/**
 * Built-in food database.
 *
 * Stored as a pipe-delimited table rather than object literals. It keeps the
 * source readable and roughly a third of the size, and it parses once at
 * module load. Values are per the stated serving, sourced from USDA FoodData
 * Central for whole foods and from published nutrition panels for branded and
 * restaurant items.
 *
 * Columns:
 *   category|name|brand|serving|grams|kcal|carb|fat|protein|sat|sugar|fiber|sodium|chol|potassium
 *
 * Grams may be 0 where a portion has no meaningful weight (e.g. beverages
 * measured by volume); gram-based serving options are simply skipped for those.
 */

const TABLE = `
Fruits|Apple||1 medium|182|95|25.1|0.3|0.5|0.1|18.9|4.4|2|0|195
Fruits|Apple, Sliced||1 cup|109|57|15.2|0.2|0.3|0|11.4|2.6|1|0|117
Fruits|Banana||1 medium|118|105|27|0.4|1.3|0.1|14.4|3.1|1|0|422
Fruits|Orange||1 medium|131|62|15.4|0.2|1.2|0|12.2|3.1|0|0|237
Fruits|Clementine||1 fruit|74|35|8.9|0.1|0.6|0|6.8|1.3|1|0|131
Fruits|Grapefruit||0.5 fruit|123|52|13.1|0.2|1|0|8.5|2|0|0|166
Fruits|Strawberries||1 cup|152|49|11.7|0.5|1|0|7.4|3|2|0|233
Fruits|Blueberries||1 cup|148|84|21.4|0.5|1.1|0|14.7|3.6|1|0|114
Fruits|Raspberries||1 cup|123|64|14.7|0.8|1.5|0|5.4|8|1|0|186
Fruits|Blackberries||1 cup|144|62|13.8|0.7|2|0|7|7.6|1|0|233
Fruits|Grapes||1 cup|151|104|27.3|0.2|1.1|0.1|23.4|1.4|3|0|288
Fruits|Cherries||1 cup|154|97|24.7|0.3|1.6|0.1|19.7|3.2|0|0|342
Fruits|Watermelon||1 cup diced|152|46|11.5|0.2|0.9|0|9.4|0.6|2|0|170
Fruits|Cantaloupe||1 cup|160|54|13|0.3|1.3|0|12.5|1.4|26|0|427
Fruits|Honeydew Melon||1 cup|170|61|15.5|0.2|0.9|0|13.8|1.4|31|0|388
Fruits|Pineapple||1 cup chunks|165|82|21.6|0.2|0.9|0|16.3|2.3|2|0|180
Fruits|Mango||1 cup|165|99|24.7|0.6|1.4|0.2|22.5|2.6|2|0|277
Fruits|Papaya||1 cup|145|62|15.7|0.4|0.7|0.1|11.3|2.5|12|0|264
Fruits|Peach||1 medium|150|59|14.3|0.4|1.4|0|12.6|2.3|0|0|285
Fruits|Nectarine||1 medium|142|63|15.1|0.5|1.5|0|11.2|2.4|0|0|285
Fruits|Pear||1 medium|178|101|27.1|0.2|0.6|0|17.4|5.5|2|0|206
Fruits|Plum||1 medium|66|30|7.5|0.2|0.5|0|6.6|0.9|0|0|104
Fruits|Apricots||2 fruits|70|34|7.8|0.3|1|0|6.5|1.4|1|0|181
Fruits|Kiwi||1 medium|69|42|10.1|0.4|0.8|0|6.2|2.1|2|0|215
Fruits|Avocado||0.5 medium|68|114|6|10.5|1.3|1.5|0.2|4.6|5|0|345
Fruits|Pomegranate Arils||0.5 cup|87|72|16.3|1|1.5|0.2|11.9|3.5|3|0|205
Fruits|Lemon||1 fruit|58|17|5.4|0.2|0.6|0|1.5|1.6|1|0|80
Fruits|Raisins||0.25 cup|36|108|28.7|0.2|1.1|0|21.5|1.4|4|0|271
Fruits|Medjool Dates||2 dates|48|133|36|0.1|0.8|0|32|3.2|1|0|334
Fruits|Dried Cranberries||0.25 cup|40|123|33|0.5|0|0|26|2.3|1|0|18
Vegetables|Broccoli||1 cup chopped|91|31|6|0.3|2.6|0|1.6|2.4|30|0|288
Vegetables|Spinach, Raw||1 cup|30|7|1.1|0.1|0.9|0|0.1|0.7|24|0|167
Vegetables|Kale, Raw||1 cup|21|7|0.9|0.3|0.6|0|0.2|0.9|11|0|76
Vegetables|Arugula||1 cup|20|5|0.7|0.1|0.5|0|0.4|0.3|5|0|74
Vegetables|Romaine Lettuce||1 cup shredded|47|8|1.5|0.1|0.6|0|0.6|1|4|0|116
Vegetables|Carrots||1 cup chopped|128|52|12.3|0.3|1.2|0|6.1|3.6|88|0|410
Vegetables|Sweet Potato, Baked||1 medium|114|103|23.6|0.2|2.3|0|7.4|3.8|41|0|542
Vegetables|Potato, Baked||1 medium|173|161|36.6|0.2|4.3|0.1|2|3.8|17|0|926
Vegetables|Tomato||1 medium|123|22|4.8|0.2|1.1|0|3.2|1.5|6|0|292
Vegetables|Cucumber||1 cup sliced|119|16|3.8|0.1|0.7|0|1.7|0.6|2|0|152
Vegetables|Red Bell Pepper||1 medium|119|37|7.2|0.4|1.2|0.1|5|2.5|4|0|251
Vegetables|Onion||1 cup chopped|160|64|14.9|0.2|1.8|0.1|6.8|2.7|6|0|234
Vegetables|Garlic||1 clove|3|4|1|0|0.2|0|0|0.1|1|0|12
Vegetables|Zucchini||1 cup sliced|113|19|3.5|0.4|1.4|0.1|2.9|1.1|10|0|295
Vegetables|Green Beans||1 cup|100|31|7|0.2|1.8|0|3.3|2.7|6|0|211
Vegetables|Asparagus||1 cup|134|27|5.2|0.2|3|0|2.5|2.8|3|0|271
Vegetables|Cauliflower||1 cup|107|27|5.3|0.3|2.1|0.1|2|2.1|32|0|320
Vegetables|Brussels Sprouts||1 cup|88|38|7.9|0.3|3|0.1|1.9|3.3|22|0|342
Vegetables|Corn||1 cup|154|132|29.3|1.8|5|0.3|6.2|3.6|23|0|392
Vegetables|Green Peas||1 cup|145|117|21|0.6|7.9|0.1|8.2|7.4|7|0|354
Vegetables|Mushrooms||1 cup sliced|70|15|2.3|0.2|2.2|0|1.4|0.7|4|0|223
Vegetables|Celery||1 cup chopped|101|16|3|0.2|0.7|0|1.8|1.6|81|0|263
Vegetables|Cabbage||1 cup chopped|89|22|5.2|0.1|1.1|0|2.8|2.2|16|0|151
Vegetables|Butternut Squash||1 cup cubed|140|63|16.4|0.1|1.4|0|3.1|2.8|8|0|493
Vegetables|Beets||1 cup|136|58|13|0.2|2.2|0|9.2|3.8|106|0|442
Vegetables|Eggplant||1 cup cubed|82|20|4.8|0.2|0.8|0|2.9|2.5|2|0|188
Vegetables|Artichoke||1 medium|120|64|14.3|0.4|3.5|0.1|1.2|6.9|72|0|343
Vegetables|Bok Choy||1 cup|70|9|1.5|0.1|1.1|0|0.8|0.7|46|0|176
Vegetables|Edamame, Shelled||0.5 cup|78|94|7.4|4|9|0.5|1.6|4|5|0|338
Vegetables|Salsa||2 tbsp|36|10|2.3|0.1|0.5|0|1.3|0.6|256|0|100
Grains|White Rice, Cooked||1 cup|158|205|44.5|0.4|4.3|0.1|0.1|0.6|2|0|55
Grains|Brown Rice, Cooked||1 cup|195|218|45.8|1.6|4.5|0.4|0.7|3.5|10|0|154
Grains|Quinoa, Cooked||1 cup|185|222|39.4|3.6|8.1|0.4|1.6|5.2|13|0|318
Grains|Oatmeal, Cooked||1 cup|234|166|28.1|3.6|5.9|0.6|0.6|4|9|0|164
Grains|Rolled Oats, Dry||0.5 cup|40|152|27|2.5|5.3|0.4|0.4|4|0|0|143
Grains|Whole Wheat Bread||1 slice|28|69|11.6|1.1|3.6|0.3|1.4|1.9|132|0|70
Grains|White Bread||1 slice|25|66|12.7|0.8|1.9|0.2|1.4|0.6|127|0|25
Grains|Sourdough Bread||1 slice|36|93|18.4|0.6|3.7|0.1|0.8|0.8|208|0|40
Grains|Bagel, Plain||1 bagel|98|257|50.5|1.5|10|0.2|5.3|2.1|450|0|96
Grains|English Muffin||1 muffin|57|134|26.2|1|4.4|0.1|2.2|1.5|246|0|74
Grains|Flour Tortilla||1 8-inch|49|146|24.2|3.9|3.9|1|0.8|1.4|361|0|60
Grains|Corn Tortilla||1 6-inch|26|52|10.7|0.7|1.4|0.1|0.2|1.5|11|0|40
Grains|Pita, Whole Wheat||1 pita|64|170|35.2|1.7|6.3|0.3|0.4|4.7|340|0|109
Grains|Naan||1 piece|90|262|45|5.1|8.7|1.3|3.2|2|419|0|120
Grains|Hamburger Bun||1 bun|52|145|26.1|2.1|5|0.5|3.4|1.1|250|0|61
Grains|Pasta, Cooked||1 cup|140|220|43.2|1.3|8.1|0.2|0.8|2.5|1|0|62
Grains|Whole Wheat Pasta, Cooked||1 cup|140|174|37.2|0.8|7.5|0.1|1.1|6.3|4|0|124
Grains|Couscous, Cooked||1 cup|157|176|36.5|0.3|6|0|0.2|2.2|8|0|91
Grains|Barley, Cooked||1 cup|157|193|44.3|0.7|3.6|0.1|0.4|6|5|0|146
Grains|Farro, Cooked||1 cup|170|200|40|1.5|8|0|1|5|0|0|150
Grains|Grits, Cooked||1 cup|242|143|31.1|0.5|3.4|0.1|0.2|1.9|5|0|53
Grains|Granola||0.5 cup|61|298|32.5|14.7|9|2.2|12|5.5|15|0|329
Grains|Pancake||1 4-inch|38|86|10.9|3.5|2.4|0.8|1.7|0.4|167|22|51
Grains|Croissant||1 medium|57|231|26.1|12|4.7|6.6|6.4|1.5|424|38|67
Grains|Cornbread||1 piece|60|173|28.3|4.6|4.4|1.1|6|1.4|428|26|96
Grains|Rice Cake||1 cake|9|35|7.3|0.3|0.7|0.1|0.1|0.4|29|0|26
Grains|Saltine Crackers||5 crackers|15|63|11|1.4|1.3|0.3|0|0.4|133|0|17
Protein|Chicken Breast, Grilled||4 oz|112|187|0|4.1|35.1|1.2|0|0|84|96|332
Protein|Chicken Thigh, Roasted||4 oz|112|209|0|10.9|26|3|0|0|95|130|254
Protein|Chicken Wing||1 wing|34|99|0|6.7|9.1|1.9|0|0|82|39|63
Protein|Rotisserie Chicken||3 oz|85|151|0|7.7|19.4|2.2|0|0|386|68|175
Protein|Ground Chicken, Cooked||4 oz|112|161|0|9.3|19.4|2.6|0|0|68|79|245
Protein|Ground Beef, 85% Lean||4 oz|112|240|0|15.4|23.6|6|0|0|78|82|341
Protein|Ground Beef, 93% Lean||4 oz|112|172|0|8.2|23.3|3.4|0|0|76|78|350
Protein|Ribeye Steak||4 oz|112|291|0|22.1|22.3|9|0|0|62|81|297
Protein|Sirloin Steak||4 oz|112|207|0|9.1|29.4|3.5|0|0|66|89|397
Protein|Pork Chop||4 oz|112|206|0|10.2|26.5|3.6|0|0|62|79|423
Protein|Pork Tenderloin||4 oz|112|163|0|4.3|29.4|1.5|0|0|65|89|528
Protein|Ground Turkey, 93% Lean||4 oz|112|190|0|10.4|24.1|2.7|0|0|87|90|265
Protein|Ground Lamb||4 oz|112|319|0|26.6|18.5|11.6|0|0|79|89|288
Protein|Bacon||2 slices|16|87|0.2|6.7|6.2|2.2|0|0|370|20|95
Protein|Turkey Bacon||2 slices|28|60|1|4.5|4|1.5|0|0|328|25|70
Protein|Deli Ham||2 oz|56|68|1.6|2.4|9.9|0.8|0.9|0|727|28|178
Protein|Deli Turkey Breast||2 oz|56|58|1.6|0.8|10.7|0.2|1.2|0|578|24|165
Protein|Deli Roast Beef||2 oz|56|70|1.5|2|11.5|0.8|0|0|500|30|190
Protein|Italian Sausage||1 link|83|268|1.4|22.4|14.3|7.8|0.6|0|618|63|227
Protein|Chicken Sausage||1 link|85|140|2|8|14|2.5|1|0|480|65|200
Protein|Hot Dog, Beef||1 hot dog|57|186|2.2|16.8|6.4|6.7|1|0|572|34|88
Protein|Pepperoni||15 slices|30|141|1.2|12.6|6.3|4.6|0|0|500|31|88
Protein|Beef Meatballs||3 meatballs|85|213|5.9|15.4|12.4|5.9|1.2|0.6|452|55|195
Protein|Beef Jerky||1 oz|28|116|3.1|7.3|9.4|3.1|2.6|0.5|590|14|169
Protein|Salmon, Cooked||4 oz|112|233|0|13.9|25.2|3.1|0|0|69|71|429
Protein|Tuna, Canned in Water||1 can|142|142|0|1|30.9|0.3|0|0|466|51|335
Protein|Tilapia||4 oz|112|145|0|3|29.9|1|0|0|65|68|380
Protein|Cod||4 oz|112|119|0|1|25.9|0.2|0|0|88|62|470
Protein|Halibut||4 oz|112|124|0|2.6|23.6|0.4|0|0|78|45|490
Protein|Shrimp, Cooked||4 oz|112|112|1.4|0.4|26.1|0.1|0|0|665|200|254
Protein|Scallops||4 oz|112|111|5.4|0.9|16.9|0.1|0|0|448|33|355
Protein|Crab Meat||3 oz|85|71|0|0.5|15.5|0.1|0|0|376|45|190
Protein|Sardines, Canned||1 can|92|191|0|10.5|22.7|1.4|0|0|465|131|365
Dairy & Eggs|Egg, Large||1 egg|50|72|0.4|4.8|6.3|1.6|0.2|0|71|186|69
Dairy & Eggs|Egg White||1 white|33|17|0.2|0.1|3.6|0|0.2|0|55|0|54
Dairy & Eggs|Egg Yolk||1 yolk|17|55|0.6|4.5|2.7|1.6|0.1|0|8|184|19
Dairy & Eggs|Scrambled Eggs||2 eggs|122|182|2|13|12|4|1.5|0|340|370|160
Dairy & Eggs|Whole Milk||1 cup|244|149|11.7|8|7.7|4.6|12.3|0|105|24|322
Dairy & Eggs|2% Milk||1 cup|244|122|11.7|4.8|8.1|3.1|12.3|0|115|20|342
Dairy & Eggs|Skim Milk||1 cup|245|83|12.2|0.2|8.3|0.1|12.5|0|103|5|382
Dairy & Eggs|Almond Milk, Unsweetened||1 cup|240|39|1.5|2.9|1.6|0.2|0|1|176|0|176
Dairy & Eggs|Oat Milk||1 cup|240|120|16|5|3|0.5|7|2|100|0|390
Dairy & Eggs|Soy Milk||1 cup|243|105|12|3.6|6.3|0.5|8.9|0.5|115|0|300
Dairy & Eggs|Greek Yogurt, Plain Nonfat||1 cup|245|146|8.9|0.9|24.5|0.3|8.9|0|87|12|331
Dairy & Eggs|Greek Yogurt, Vanilla||1 container|150|130|15|2|12|1|13|0|55|10|180
Dairy & Eggs|Yogurt, Plain Whole Milk||1 cup|245|149|11.4|8|8.5|5.1|11.4|0|113|32|380
Dairy & Eggs|Cottage Cheese, 2%||1 cup|226|183|10.4|5.1|24.2|1.5|8.6|0|746|20|217
Dairy & Eggs|Cheddar Cheese||1 oz|28|114|0.4|9.4|6.5|5.3|0.1|0|180|28|20
Dairy & Eggs|Mozzarella, Part-Skim||1 oz|28|72|0.8|4.5|6.9|2.9|0.3|0|175|18|24
Dairy & Eggs|Swiss Cheese||1 oz|28|111|1.5|8.4|7.9|5.3|0.4|0|53|27|22
Dairy & Eggs|Feta Cheese||1 oz|28|75|1.2|6|4|4.2|1.2|0|316|25|18
Dairy & Eggs|Parmesan, Grated||1 tbsp|5|21|0.2|1.4|1.9|0.9|0|0|76|4|5
Dairy & Eggs|String Cheese||1 stick|28|80|1|6|6|3.5|0|0|200|20|25
Dairy & Eggs|Ricotta, Part-Skim||0.5 cup|124|171|6.4|9.8|14.1|6.1|0.3|0|155|38|155
Dairy & Eggs|Cream Cheese||1 tbsp|14|50|0.8|5|0.9|2.8|0.5|0|46|15|18
Dairy & Eggs|Butter||1 tbsp|14|102|0|11.5|0.1|7.3|0|0|91|31|3
Dairy & Eggs|Heavy Cream||1 tbsp|15|51|0.4|5.4|0.4|3.5|0.4|0|6|20|11
Dairy & Eggs|Half and Half||1 tbsp|15|20|0.6|1.7|0.4|1.1|0.6|0|6|5|19
Dairy & Eggs|Sour Cream||2 tbsp|30|59|1.4|5.6|0.7|3.3|0.9|0|15|18|41
Dairy & Eggs|Vanilla Ice Cream||0.5 cup|66|137|15.6|7.3|2.3|4.5|14|0.5|53|29|131
Nuts & Legumes|Almonds||1 oz|28|164|6.1|14.2|6|1.1|1.2|3.5|0|0|208
Nuts & Legumes|Walnuts||1 oz|28|185|3.9|18.5|4.3|1.7|0.7|1.9|1|0|125
Nuts & Legumes|Cashews||1 oz|28|157|8.6|12.4|5.2|2.2|1.7|0.9|3|0|187
Nuts & Legumes|Pistachios||1 oz|28|159|7.7|12.9|5.7|1.6|2.2|3|0|0|291
Nuts & Legumes|Pecans||1 oz|28|196|3.9|20.4|2.6|1.8|1.1|2.7|0|0|116
Nuts & Legumes|Peanuts||1 oz|28|161|4.6|14|7.3|1.9|1.3|2.4|5|0|200
Nuts & Legumes|Macadamia Nuts||1 oz|28|204|3.9|21.5|2.2|3.4|1.3|2.4|1|0|104
Nuts & Legumes|Peanut Butter||2 tbsp|32|188|6.9|16.1|8|3.3|3.4|1.8|152|0|208
Nuts & Legumes|Almond Butter||2 tbsp|32|196|6.2|17.8|6.7|1.4|1.5|3.3|2|0|240
Nuts & Legumes|Chia Seeds||1 tbsp|12|58|5|3.7|2|0.4|0|4.1|2|0|53
Nuts & Legumes|Ground Flaxseed||1 tbsp|10|55|3|4.3|1.9|0.4|0.2|2.8|3|0|81
Nuts & Legumes|Sunflower Seeds||1 oz|28|165|6.8|14.1|5.5|1.2|0.8|3.1|1|0|182
Nuts & Legumes|Pumpkin Seeds||1 oz|28|158|3|13.9|8.6|2.5|0.4|1.8|5|0|223
Nuts & Legumes|Sesame Seeds||1 tbsp|9|52|2.1|4.5|1.6|0.6|0|1.1|1|0|42
Nuts & Legumes|Black Beans||0.5 cup|86|114|20.4|0.5|7.6|0.1|0.3|7.5|1|0|305
Nuts & Legumes|Chickpeas||0.5 cup|82|134|22.5|2.1|7.3|0.2|3.9|6.2|6|0|239
Nuts & Legumes|Lentils, Cooked||0.5 cup|99|115|19.9|0.4|8.9|0.1|1.8|7.8|2|0|366
Nuts & Legumes|Kidney Beans||0.5 cup|89|112|20.2|0.4|7.7|0.1|0.3|5.7|1|0|357
Nuts & Legumes|Pinto Beans||0.5 cup|86|122|22.4|0.6|7.7|0.1|0.3|7.7|1|0|373
Nuts & Legumes|Refried Beans||0.5 cup|120|109|18.2|1.4|6.3|0.5|0.5|6.1|377|0|337
Nuts & Legumes|Hummus||2 tbsp|30|71|6|5|2|0.7|0|1.5|114|0|69
Nuts & Legumes|Tofu, Firm||3 oz|85|71|1.7|4|8.7|0.6|0.5|0.9|12|0|106
Nuts & Legumes|Tempeh||3 oz|85|162|7.8|9|15.4|1.8|0|0|9|0|342
Nuts & Legumes|Trail Mix||0.25 cup|37|173|16.8|11|5.2|2.1|0|2|86|0|257
Fast Food|Big Mac|McDonald's|1 sandwich|219|563|45|33|26|11|9|3|1010|79|400
Fast Food|Quarter Pounder with Cheese|McDonald's|1 sandwich|202|520|42|26|30|13|10|2|1140|95|460
Fast Food|Cheeseburger|McDonald's|1 sandwich|115|302|32|13|15|6|7|2|682|41|230
Fast Food|Hamburger|McDonald's|1 sandwich|100|250|31|9|12|3.5|6|1|510|30|200
Fast Food|McChicken|McDonald's|1 sandwich|143|400|39|21|14|3.5|5|2|560|40|250
Fast Food|Chicken McNuggets, 10 pc|McDonald's|10 pieces|162|420|25|25|23|4|0|1|840|65|400
Fast Food|French Fries, Medium|McDonald's|1 medium|117|320|43|15|4|2|0|4|260|0|630
Fast Food|French Fries, Large|McDonald's|1 large|150|480|65|23|6|3|0|5|400|0|830
Fast Food|Egg McMuffin|McDonald's|1 sandwich|139|310|30|13|17|6|3|2|770|250|240
Fast Food|Sausage McMuffin with Egg|McDonald's|1 sandwich|163|480|30|31|20|12|2|2|830|285|280
Fast Food|Hash Brown|McDonald's|1 piece|53|140|17|8|1|1|0|2|300|0|230
Fast Food|Vanilla Cone|McDonald's|1 cone|111|200|32|5|5|3.5|24|0|90|20|250
Fast Food|Whopper|Burger King|1 sandwich|291|657|49|40|31|12|11|2|911|90|500
Fast Food|Chicken Fries, 9 pc|Burger King|9 pieces|110|280|20|17|14|2.5|0|1|850|30|200
Fast Food|Turkey Breast Sub, 6"|Subway|1 sub|219|280|46|3.5|18|1|8|5|760|25|320
Fast Food|Italian B.M.T. Sub, 6"|Subway|1 sub|245|410|44|16|20|6|8|5|1260|55|350
Fast Food|Meatball Marinara Sub, 6"|Subway|1 sub|298|480|60|18|21|8|12|7|1010|45|500
Fast Food|Chicken Burrito Bowl|Chipotle|1 bowl|510|625|53|22|45|7|4|12|1370|125|900
Fast Food|Chicken Burrito|Chipotle|1 burrito|670|975|121|33|55|12|6|16|2160|145|1200
Fast Food|Guacamole|Chipotle|1 serving|113|230|8|22|2|3.5|1|6|370|0|500
Fast Food|Chips|Chipotle|1 bag|113|540|73|25|7|3|1|5|390|0|200
Fast Food|Crunchy Taco|Taco Bell|1 taco|78|170|13|10|8|3.5|1|3|300|25|150
Fast Food|Bean Burrito|Taco Bell|1 burrito|198|350|54|9|13|3.5|3|9|1000|5|400
Fast Food|Crunchwrap Supreme|Taco Bell|1 item|254|530|71|21|16|6|6|6|1200|30|400
Fast Food|Chicken Sandwich|Chick-fil-A|1 sandwich|183|440|41|19|28|4|6|2|1400|70|380
Fast Food|Spicy Deluxe Sandwich|Chick-fil-A|1 sandwich|208|550|45|26|34|7|7|3|1740|85|450
Fast Food|Nuggets, 8 ct|Chick-fil-A|8 pieces|113|250|11|11|27|2.5|1|0|1210|85|300
Fast Food|Waffle Fries, Medium|Chick-fil-A|1 medium|125|420|45|24|5|4|1|5|240|0|800
Fast Food|Dave's Single|Wendy's|1 sandwich|253|570|39|34|29|14|9|2|1150|95|500
Fast Food|Baconator|Wendy's|1 sandwich|332|950|40|62|58|26|9|2|1630|195|800
Fast Food|Chili, Small|Wendy's|1 small|227|240|23|8|20|3.5|6|6|890|55|700
Fast Food|Double-Double|In-N-Out|1 burger|330|670|39|41|37|18|10|3|1440|120|550
Fast Food|Hamburger|Five Guys|1 burger|303|700|39|43|39|18|8|2|430|115|600
Fast Food|ShackBurger|Shake Shack|1 burger|200|550|38|33|27|14|8|1|1140|85|450
Fast Food|Original Recipe Drumstick|KFC|1 drumstick|59|130|4|8|12|1.5|0|0|380|65|150
Fast Food|Orange Chicken|Panda Express|1 serving|156|490|51|23|25|5|19|2|820|80|320
Fast Food|Chow Mein|Panda Express|1 serving|280|510|80|20|13|3.5|9|6|860|0|400
Fast Food|Broccoli Cheddar Soup, Cup|Panera|1 cup|227|240|15|16|10|9|5|3|1080|45|350
Fast Food|Pepperoni Pizza, Medium|Domino's|1 slice|101|210|24|9|9|4|2|1|480|20|150
Fast Food|Pepperoni Pan Pizza|Pizza Hut|1 slice|113|290|30|14|12|5.5|2|1.5|640|25|180
Fast Food|Glazed Donut|Dunkin'|1 donut|60|240|29|12|4|5|12|1|300|0|60
Beverages|Caffe Latte, Grande, 2%|Starbucks|1 grande|473|190|19|7|13|4.5|18|0|150|25|570
Beverages|Caramel Macchiato, Grande|Starbucks|1 grande|473|250|35|7|10|4.5|33|0|150|25|400
Beverages|Caramel Frappuccino, Grande|Starbucks|1 grande|473|380|54|15|5|10|54|0|240|50|350
Beverages|Cold Brew, Grande|Starbucks|1 grande|473|5|0|0|0|0|0|0|15|0|100
Beverages|Pike Place Roast, Grande|Starbucks|1 grande|473|5|0|0|1|0|0|0|10|0|200
Beverages|Iced Coffee, Medium|Dunkin'|1 medium|710|15|3|0|0|0|0|0|25|0|100
Beverages|Coffee, Black||1 cup|237|2|0|0|0.3|0|0|0|5|0|116
Beverages|Green Tea||1 cup|245|2|0.5|0|0.5|0|0|0|2|0|21
Beverages|Orange Juice||1 cup|248|112|25.8|0.5|1.7|0.1|20.8|0.5|2|0|496
Beverages|Apple Juice||1 cup|248|114|28|0.3|0.2|0.1|24|0.5|10|0|250
Beverages|Coca-Cola||1 can (12 oz)|355|140|39|0|0|0|39|0|45|0|0
Beverages|Diet Coke||1 can (12 oz)|355|0|0|0|0|0|0|0|40|0|0
Beverages|Sprite||1 can (12 oz)|355|140|38|0|0|0|38|0|65|0|0
Beverages|Sparkling Water||1 can (12 oz)|355|0|0|0|0|0|0|0|0|0|0
Beverages|Gatorade||20 fl oz|591|140|36|0|0|0|34|0|270|0|75
Beverages|Vitaminwater||20 fl oz|591|120|32|0|0|0|32|0|0|0|0
Beverages|Red Bull||1 can (8.4 oz)|250|110|28|0|1|0|27|0|105|0|0
Beverages|Monster Energy||1 can (16 oz)|473|210|54|0|0|0|54|0|370|0|0
Beverages|Kombucha||1 cup|240|30|7|0|0|0|4|0|10|0|30
Beverages|Beer, Regular||12 fl oz|356|153|12.6|0|1.6|0|0|0|14|0|96
Beverages|Beer, Light||12 fl oz|354|103|5.8|0|0.9|0|0|0|14|0|74
Beverages|Red Wine||5 fl oz|147|125|3.8|0|0.1|0|0.9|0|6|0|187
Beverages|White Wine||5 fl oz|147|121|3.8|0|0.1|0|1.4|0|7|0|104
Beverages|Vodka, 80 proof||1.5 fl oz|42|97|0|0|0|0|0|0|0|0|0
Packaged|Cheerios|General Mills|1 cup|28|100|20.5|2|3|0.5|1.2|3|140|0|180
Packaged|Honey Nut Cheerios|General Mills|1 cup|37|140|29|2|3|0|12|3|210|0|130
Packaged|Frosted Flakes|Kellogg's|1 cup|41|150|36|0|2|0|15|1|190|0|25
Packaged|Special K|Kellogg's|1 cup|31|120|23|0.5|6|0|4|3|220|0|60
Packaged|Raisin Bran|Kellogg's|1 cup|59|190|46|1|5|0|18|7|210|0|350
Packaged|Grape-Nuts|Post|0.5 cup|58|200|47|1|6|0|5|7|290|0|200
Packaged|Instant Oatmeal, Maple Brown Sugar|Quaker|1 packet|43|160|33|2|4|0.5|12|3|260|0|110
Packaged|Everything Bagel|Thomas'|1 bagel|95|250|49|1.5|10|0|5|2|470|0|100
Packaged|21 Whole Grains Bread|Dave's Killer Bread|1 slice|45|110|22|1.5|5|0|5|5|170|0|100
Packaged|Waffles, Homestyle|Eggo|2 waffles|70|180|28|6|4|1.5|3|1|370|15|60
Packaged|Buttermilk Pancake Mix|Kodiak Cakes|0.5 cup|53|190|30|2|14|0|3|5|560|0|200
Packaged|Macaroni & Cheese, Prepared|Kraft|1 cup|198|350|47|13|10|3.5|7|2|610|10|180
Packaged|Tomato Soup|Campbell's|1 cup|245|90|20|0|2|0|12|1|480|0|300
Packaged|Chicken Noodle Soup|Progresso|1 cup|240|100|13|2|7|0.5|1|1|690|20|250
Packaged|Organic Lentil Soup|Amy's|1 cup|245|180|25|5|8|0.5|4|8|590|0|500
Packaged|Protein Bar, Cookie Dough|Quest|1 bar|60|200|21|8|21|3|1|14|210|5|130
Packaged|Chocolate Sea Salt Bar|RXBAR|1 bar|52|210|24|9|12|1.5|13|5|260|0|250
Packaged|Chocolate Chip Bar|Clif Bar|1 bar|68|250|45|5|9|1.5|21|4|150|0|320
Packaged|Dark Chocolate Nuts & Sea Salt|KIND|1 bar|40|200|16|15|6|3|5|7|140|0|180
Packaged|Oats 'n Honey Granola Bar|Nature Valley|2 bars|42|190|29|7|4|1|11|2|180|0|120
Packaged|Greek Yogurt, Strawberry|Chobani|1 container|150|140|20|2.5|12|1.5|15|0|65|10|190
Packaged|Core Power Protein Shake|Fairlife|1 bottle|414|170|8|4.5|26|3|6|0|230|30|750
Packaged|Protein Shake, Chocolate|Premier Protein|1 bottle|325|160|5|3|30|1|1|3|220|20|500
Packaged|Whey Protein Powder||1 scoop|31|120|3|1.5|24|1|2|1|130|45|180
Packaged|Casein Protein Powder||1 scoop|33|120|4|1|24|0.5|2|1|160|15|200
Packaged|Plant Protein Powder||1 scoop|32|130|6|2.5|21|0.5|1|3|250|0|250
Snacks|Oreo Cookies|Nabisco|3 cookies|34|160|25|7|1|2|14|1|135|0|60
Snacks|Goldfish, Cheddar|Pepperidge Farm|55 pieces|30|140|20|5|3|1|0|1|250|5|40
Snacks|Cheez-It|Sunshine|27 crackers|30|150|17|8|3|2|0|1|230|0|40
Snacks|Ritz Crackers|Nabisco|5 crackers|16|80|10|4|1|1|1|0|105|0|20
Snacks|Triscuit|Nabisco|6 crackers|28|120|20|4|3|0.5|0|3|135|0|100
Snacks|Classic Potato Chips|Lay's|1 oz|28|160|15|10|2|1.5|0|1|170|0|350
Snacks|Nacho Cheese Tortilla Chips|Doritos|1 oz|28|150|18|8|2|1|1|1|210|0|60
Snacks|Original Crisps|Pringles|1 oz|28|150|15|9|1|2.5|0|1|150|0|110
Snacks|Popcorn, Air-Popped||3 cups|24|93|18.6|1.1|3.1|0.2|0.2|3.5|2|0|82
Snacks|Popcorn, Original|SkinnyPop|1 serving|28|150|15|9|2|1|0|3|75|0|60
Snacks|Pretzels||1 oz|28|108|22.5|0.8|2.6|0.2|0.6|0.9|352|0|41
Snacks|Snickers Bar|Mars|1 bar|52|250|33|12|4|4.5|27|1|120|5|150
Snacks|Peanut M&M's|Mars|1 bag|49|250|30|13|5|5|25|2|25|5|160
Snacks|Peanut Butter Cups|Reese's|2 cups|45|210|24|13|5|4.5|21|1|150|0|130
Snacks|Milk Chocolate Bar|Hershey's|1 bar|43|220|26|13|3|8|24|1|35|10|170
Snacks|Dark Chocolate, 70%||1 oz|28|170|13|12|2|7|7|3|6|0|200
Snacks|Half Baked Ice Cream|Ben & Jerry's|0.667 cup|110|320|39|16|5|10|30|1|90|55|220
Snacks|Vanilla Bean Ice Cream|Halo Top|0.667 cup|88|100|18|2.5|6|1.5|8|3|105|10|200
Snacks|Hazelnut Spread|Nutella|2 tbsp|37|200|22|12|2|4|21|1|15|0|90
Snacks|Creamy Peanut Butter|Jif|2 tbsp|33|190|8|16|7|3|3|2|140|0|200
Condiments|Olive Oil||1 tbsp|14|119|0|13.5|0|1.9|0|0|0|0|0
Condiments|Coconut Oil||1 tbsp|14|121|0|13.5|0|11.2|0|0|0|0|0
Condiments|Mayonnaise||1 tbsp|14|94|0.1|10.3|0.1|1.6|0.1|0|88|5|2
Condiments|Ketchup||1 tbsp|17|19|4.7|0|0.2|0|3.7|0.1|154|0|57
Condiments|Mustard||1 tsp|5|3|0.3|0.2|0.2|0|0.1|0.2|55|0|7
Condiments|Ranch Dressing||2 tbsp|30|129|1.8|13.4|0.4|2.1|1.4|0|270|8|30
Condiments|Balsamic Vinaigrette||2 tbsp|31|90|4|8|0|1|3|0|320|0|15
Condiments|Soy Sauce||1 tbsp|16|9|0.8|0.1|1.3|0|0.1|0.1|879|0|32
Condiments|Sriracha||1 tsp|5|5|1|0|0|0|1|0|80|0|12
Condiments|Hot Sauce||1 tsp|5|1|0.1|0|0|0|0|0|124|0|7
Condiments|BBQ Sauce||2 tbsp|36|58|14|0.2|0.3|0|12|0.3|350|0|60
Condiments|Marinara Sauce||0.5 cup|125|80|12|2.5|2|0.4|7|3|460|0|400
Condiments|Pesto||2 tbsp|32|160|2|16|3|3|0|1|300|5|60
Condiments|Guacamole||2 tbsp|30|50|3|4.5|0.6|0.7|0.2|2|110|0|150
Condiments|Honey||1 tbsp|21|64|17.3|0|0.1|0|17.2|0|1|0|11
Condiments|Maple Syrup||1 tbsp|20|52|13.4|0|0|0|12.1|0|2|0|42
Condiments|Sugar||1 tsp|4|16|4.2|0|0|0|4.2|0|0|0|0
Condiments|Strawberry Jam||1 tbsp|20|56|13.8|0|0.1|0|9.7|0.2|6|0|15
Condiments|Nutritional Yeast||1 tbsp|5|20|2|0|3|0|0|1|5|0|40
Meals|Cheese Pizza||1 slice|107|285|35.6|10.4|12.2|4.8|3.8|2.5|640|22|184
Meals|Caesar Salad with Chicken||1 salad|300|470|12|33|32|8|4|4|1100|100|500
Meals|Garden Salad, No Dressing||1 salad|150|35|7|0.3|2|0|3.5|2.5|25|0|350
Meals|California Roll||6 pieces|170|255|38|7|9|1.5|6|3|430|15|150
Meals|Salmon Nigiri||2 pieces|60|110|16|2|7|0.5|2|0|100|12|100
Meals|Pad Thai||1 order|400|700|90|25|30|5|25|4|1500|100|600
Meals|Chicken Fried Rice||1 order|250|450|60|14|18|3|3|2|1200|90|300
Meals|Chicken Stir Fry||1 serving|350|420|30|18|35|3|10|5|1000|100|800
Meals|Turkey Sandwich||1 sandwich|200|380|45|10|28|3|6|4|1200|55|400
Meals|Grilled Cheese Sandwich||1 sandwich|120|400|32|24|15|12|5|2|800|55|150
Meals|Chicken Caesar Wrap||1 wrap|250|610|48|33|32|9|4|3|1400|95|450
Meals|Beef Tacos||2 tacos|200|380|30|20|20|8|3|5|700|55|450
Meals|Burrito Bowl, Homemade||1 bowl|400|550|60|18|38|5|5|12|900|90|900
Meals|Macaroni and Cheese||1 cup|198|390|45|16|15|8|6|2|800|40|200
Meals|Mashed Potatoes||1 cup|210|214|35|8.7|4|2.2|3.2|3.2|636|6|700
Meals|Chicken Noodle Soup||1 cup|241|75|9.4|2.5|4|0.6|1|0.7|1106|7|55
Meals|French Toast||2 slices|130|300|36|12|10|3|8|2|500|130|200
Meals|Cheese Omelette||3 eggs|180|350|3|27|23|11|2|0|500|570|250
Meals|Breakfast Burrito||1 burrito|200|480|40|24|25|9|3|3|1100|250|450
Meals|Protein Smoothie||1 smoothie|400|350|45|8|28|2|30|6|200|30|800
Meals|Acai Bowl||1 bowl|300|450|70|16|8|5|40|10|60|0|700
Meals|Overnight Oats||1 serving|300|380|55|12|15|3|15|8|150|5|500
Meals|Salmon with Vegetables||1 plate|350|450|20|24|38|5|8|6|400|90|1200
`.trim()

export interface SeedFood extends Food {
  category: string
}

function buildServings(label: string, gramsPerServing: number): Serving[] {
  const servings: Serving[] = [{ label, grams: gramsPerServing || undefined, multiplier: 1 }]
  if (gramsPerServing > 0) {
    servings.push({ label: '100 g', grams: 100, multiplier: 100 / gramsPerServing })
    servings.push({ label: '1 g', grams: 1, multiplier: 1 / gramsPerServing })
    servings.push({ label: '1 oz', grams: 28.35, multiplier: 28.35 / gramsPerServing })
  }
  return servings
}

/** Column count of the table above. Guarded so a missing or extra pipe fails
 *  loudly at load rather than silently shifting every value in the row. */
const COLUMNS = 15

function parse(): SeedFood[] {
  return TABLE.split('\n').map((line, i) => {
    const fields = line.split('|')
    if (fields.length !== COLUMNS) {
      throw new Error(
        `seedFoods: row ${i + 1} has ${fields.length} fields, expected ${COLUMNS}, "${line}"`
      )
    }

    const [
      category,
      name,
      brand,
      serving,
      grams,
      kcal,
      carb,
      fat,
      protein,
      sat,
      sugar,
      fiber,
      sodium,
      chol,
      potassium,
    ] = fields

    const n: Nutrients = {
      ...emptyNutrients(),
      calories: +kcal,
      carbs: +carb,
      fat: +fat,
      protein: +protein,
      satFat: +sat,
      sugar: +sugar,
      fiber: +fiber,
      sodium: +sodium,
      cholesterol: +chol,
      potassium: +potassium,
    }

    return {
      id: `seed_${i}`,
      name,
      brand: brand || undefined,
      nutrients: n,
      servings: buildServings(serving, +grams),
      source: 'seed' as const,
      verified: true,
      category,
    }
  })
}

export const SEED_FOODS: SeedFood[] = parse()

export const SEED_BY_ID = new Map(SEED_FOODS.map((f) => [f.id, f as Food]))

export const CATEGORIES = Array.from(new Set(SEED_FOODS.map((f) => f.category)))
