import { db } from "./index";
import { dealersTable, listingsTable } from "./schema/listings";

async function seed() {
  console.log("Seeding database...");

  await db.delete(listingsTable);
  await db.delete(dealersTable);

  const dealers = await db.insert(dealersTable).values([
    { name: "Freedom RV Supercenter", city: "Phoenix", state: "AZ", phone: "480-555-0101", rating: 4.8, reviewCount: 312, avgResponseTime: "< 1 hour", beginnerFriendly: true, yearsInBusiness: 22, totalListings: 187 },
    { name: "Camping World of Denver", city: "Denver", state: "CO", phone: "720-555-0202", rating: 4.5, reviewCount: 228, avgResponseTime: "< 2 hours", beginnerFriendly: true, yearsInBusiness: 15, totalListings: 143 },
    { name: "Lazy Days RV Tampa", city: "Tampa", state: "FL", phone: "813-555-0303", rating: 4.9, reviewCount: 541, avgResponseTime: "< 30 minutes", beginnerFriendly: false, yearsInBusiness: 35, totalListings: 380 },
    { name: "Pete's RV Center", city: "Burlington", state: "VT", phone: "802-555-0404", rating: 4.7, reviewCount: 156, avgResponseTime: "< 2 hours", beginnerFriendly: true, yearsInBusiness: 28, totalListings: 92 },
    { name: "General RV Center", city: "Wixom", state: "MI", phone: "248-555-0505", rating: 4.6, reviewCount: 397, avgResponseTime: "< 1 hour", beginnerFriendly: false, yearsInBusiness: 50, totalListings: 512 },
  ]).returning();

  const [az, co, fl, vt, mi] = dealers;

  await db.insert(listingsTable).values([
    {
      title: "2023 Grand Design Reflection 337RLS Fifth Wheel",
      make: "Grand Design", model: "Reflection 337RLS", year: 2023, type: "fifth_wheel",
      price: 54900, marketValue: 61500, dealScore: "great_deal", dealSavings: 6600,
      length: 40, slides: 4, sleeps: 6, mileage: 0,
      location: "Phoenix, AZ", state: "AZ",
      dealerId: az.id, dealerName: az.name,
      condition: "used", isNew: false, isFeatured: true,
      dryWeight: 13285, gvwr: 16750, hitchWeight: 2185, freshWater: 100,
      generator: false, solar: true, awning: true, outdoorKitchen: true, washerDryer: false,
      daysOnMarket: 12,
      description: "One owner, non-smoker, no pets. This stunning 2023 Grand Design Reflection 337RLS is in like-new condition. Loaded with the Comfort Package, Luxury Vinyl Plank flooring throughout, residential refrigerator, and a massive 4-slide living area that rivals many Class A motorhomes.",
      features: ["Residential Refrigerator", "King Bed", "4 Power Slides", "Central Vacuum", "Outdoor Kitchen", "Solar Prep", "King Size Bed", "Washer/Dryer Prep", "Fireplace"],
      images: [
        "https://images.unsplash.com/photo-1587329310686-91414b8e3122?w=800&q=80",
        "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80"
      ],
      priceHistory: [
        { date: "2024-09-01", price: 61900 }, { date: "2024-10-15", price: 59500 },
        { date: "2024-11-20", price: 57500 }, { date: "2024-12-10", price: 54900 }
      ],
    },
    {
      title: "2024 Thor Motor Coach Magnitude XG32 Super C",
      make: "Thor Motor Coach", model: "Magnitude XG32", year: 2024, type: "class_c",
      price: 189900, marketValue: 195000, dealScore: "good_deal", dealSavings: 5100,
      length: 36, slides: 2, sleeps: 8, mileage: 1200,
      location: "Denver, CO", state: "CO",
      dealerId: co.id, dealerName: co.name,
      condition: "used", isNew: false, isFeatured: true,
      dryWeight: 22000, gvwr: 26000, hitchWeight: 0, freshWater: 80,
      generator: true, solar: false, awning: true, outdoorKitchen: false, washerDryer: true,
      daysOnMarket: 7,
      description: "Nearly new 2024 Thor Magnitude Super C motorhome with only 1,200 lightly driven miles. Built on a powerful Ford F-600 Super Duty chassis. This is the all-new XG32 floorplan featuring a 180-degree lounge, bunk beds, and a massive outdoor entertainment center.",
      features: ["Ford F-600 Chassis", "400HP V8 Diesel", "Winegard Connect 2.0", "Satellite TV", "Bunk Beds", "King Bed", "Washer/Dryer", "Full-Body Paint"],
      images: [
        "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&q=80",
        "https://images.unsplash.com/photo-1511300636408-a63a89df3482?w=800&q=80"
      ],
      priceHistory: [
        { date: "2024-11-01", price: 195000 }, { date: "2024-12-01", price: 192000 },
        { date: "2025-01-15", price: 189900 }
      ],
    },
    {
      title: "2022 Airstream Classic 33FB Travel Trailer",
      make: "Airstream", model: "Classic 33FB", year: 2022, type: "travel_trailer",
      price: 129900, marketValue: 125000, dealScore: "fair_deal", dealSavings: 0,
      length: 33, slides: 0, sleeps: 4, mileage: 0,
      location: "Tampa, FL", state: "FL",
      dealerId: fl.id, dealerName: fl.name,
      condition: "used", isNew: false, isFeatured: true,
      dryWeight: 8000, gvwr: 10000, hitchWeight: 750, freshWater: 42,
      generator: false, solar: true, awning: true, outdoorKitchen: false, washerDryer: false,
      daysOnMarket: 21,
      description: "The iconic Airstream Classic 33FB in the coveted \"Hatch\" twin bed floorplan. This 2022 model features a stunning all-electric kitchen, ceramic cooktop, convection microwave, and the classic aircraft-grade aluminum shell that will outlast your grandkids.",
      features: ["All-Electric Kitchen", "Ceramic Cooktop", "Solar Ready", "Wifi Ranger", "Hitch Ball", "Adjustable Queen", "Polished Exterior Accent"],
      images: [
        "https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?w=800&q=80",
        "https://images.unsplash.com/photo-1445375011782-2384686778a0?w=800&q=80"
      ],
      priceHistory: [
        { date: "2024-10-01", price: 134000 }, { date: "2024-11-01", price: 131000 },
        { date: "2024-12-01", price: 129900 }
      ],
    },
    {
      title: "2021 Forest River Wildwood 28DBUD Bunk Model",
      make: "Forest River", model: "Wildwood 28DBUD", year: 2021, type: "travel_trailer",
      price: 22900, marketValue: 28500, dealScore: "great_deal", dealSavings: 5600,
      length: 32, slides: 1, sleeps: 10, mileage: 0,
      location: "Burlington, VT", state: "VT",
      dealerId: vt.id, dealerName: vt.name,
      condition: "used", isNew: false, isFeatured: false,
      dryWeight: 7250, gvwr: 9995, hitchWeight: 1155, freshWater: 51,
      generator: false, solar: false, awning: true, outdoorKitchen: false, washerDryer: false,
      daysOnMarket: 34,
      description: "Perfect family camper! This popular Wildwood bunk model comfortably sleeps 10 with dual bunk rooms. Super lightweight at 7,250 lbs dry — easily towable by a half-ton truck. One owner family, garage stored, and meticulously maintained.",
      features: ["Double Bunk Rooms", "1 Full Slide", "Full Kitchen", "Outside Shower", "Solar Prep", "12V Refrigerator"],
      images: [
        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
        "https://images.unsplash.com/photo-1464217079751-71d1f93e44a0?w=800&q=80"
      ],
      priceHistory: [
        { date: "2024-08-01", price: 29900 }, { date: "2024-10-01", price: 26500 },
        { date: "2025-01-01", price: 22900 }
      ],
    },
    {
      title: "2023 Winnebago Travato 59KL Class B Van",
      make: "Winnebago", model: "Travato 59KL", year: 2023, type: "class_b",
      price: 79900, marketValue: 89000, dealScore: "great_deal", dealSavings: 9100,
      length: 21, slides: 0, sleeps: 2, mileage: 8500,
      location: "Wixom, MI", state: "MI",
      dealerId: mi.id, dealerName: mi.name,
      condition: "used", isNew: false, isFeatured: true,
      dryWeight: 6120, gvwr: 8550, hitchWeight: 0, freshWater: 28,
      generator: false, solar: true, awning: false, outdoorKitchen: false, washerDryer: false,
      daysOnMarket: 4,
      description: "Hot listing! The Travato 59KL is the van life dream — 2 people living comfortably in a fully self-contained package. Features the Volta all-electric system, lithium batteries, 400W solar, induction cooktop, and a wet bath. Fits in standard parking spots.",
      features: ["Volta Electric System", "400W Solar", "Lithium Batteries", "Induction Cooktop", "Wet Bath", "Ram ProMaster 3500 Chassis", "Smartphone App Control"],
      images: [
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80",
        "https://images.unsplash.com/photo-1476357471311-43c0db9fb2b4?w=800&q=80"
      ],
      priceHistory: [
        { date: "2024-12-01", price: 89000 }, { date: "2025-01-01", price: 84000 },
        { date: "2025-02-15", price: 79900 }
      ],
    },
    {
      title: "2024 Tiffin Allegro Bus 45OPP Class A Diesel",
      make: "Tiffin", model: "Allegro Bus 45OPP", year: 2024, type: "class_a",
      price: 485000, marketValue: 510000, dealScore: "good_deal", dealSavings: 25000,
      length: 45, slides: 4, sleeps: 4, mileage: 2100,
      location: "Tampa, FL", state: "FL",
      dealerId: fl.id, dealerName: fl.name,
      condition: "used", isNew: false, isFeatured: true,
      dryWeight: 44750, gvwr: 54200, hitchWeight: 0, freshWater: 150,
      generator: true, solar: true, awning: true, outdoorKitchen: true, washerDryer: true,
      daysOnMarket: 9,
      description: "The flagship of luxury RVing. This nearly new Tiffin Allegro Bus is loaded with every possible option including a tag axle, air ride suspension, full body paint, tile floors, fireplace, and the incomparable Tiffin build quality. Sold by motivated original owner upgrading to a custom coach.",
      features: ["Cummins ISX 605HP Engine", "Tag Axle", "Full-Body Paint", "4-Slide", "Residential Refrigerator", "Washer/Dryer", "Outdoor Kitchen", "King Bed", "Multiple LCD TVs", "Fireplace", "Tile Flooring"],
      images: [
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
        "https://images.unsplash.com/photo-1474533410209-18b0218b5cd4?w=800&q=80"
      ],
      priceHistory: [
        { date: "2025-01-01", price: 510000 }, { date: "2025-02-01", price: 499000 },
        { date: "2025-03-01", price: 485000 }
      ],
    },
    {
      title: "2022 Lance 2375 Travel Trailer – Solar Ready",
      make: "Lance", model: "2375", year: 2022, type: "travel_trailer",
      price: 44500, marketValue: 47800, dealScore: "good_deal", dealSavings: 3300,
      length: 24, slides: 1, sleeps: 6, mileage: 0,
      location: "Denver, CO", state: "CO",
      dealerId: co.id, dealerName: co.name,
      condition: "used", isNew: false, isFeatured: false,
      dryWeight: 6989, gvwr: 9995, hitchWeight: 1155, freshWater: 57,
      generator: false, solar: true, awning: true, outdoorKitchen: false, washerDryer: false,
      daysOnMarket: 18,
      description: "Built in the USA by Lance, known for their superior quality and craftsmanship. This 2375 is light enough for a half-ton yet packed with a full-size kitchen, slide-out living room, and premium composites throughout the exterior. Solar package already installed.",
      features: ["Made in USA", "350W Solar Package", "LED Lights", "Slide-Out Living Room", "Full Pantry", "Tankless Water Heater"],
      images: [
        "https://images.unsplash.com/photo-1527786356703-4b100091cd2c?w=800&q=80",
      ],
      priceHistory: [
        { date: "2024-11-01", price: 47800 }, { date: "2025-01-15", price: 44500 }
      ],
    },
    {
      title: "2020 Keystone Montana 3855BR Luxury Fifth Wheel",
      make: "Keystone", model: "Montana 3855BR", year: 2020, type: "fifth_wheel",
      price: 47500, marketValue: 56000, dealScore: "great_deal", dealSavings: 8500,
      length: 42, slides: 4, sleeps: 8, mileage: 0,
      location: "Phoenix, AZ", state: "AZ",
      dealerId: az.id, dealerName: az.name,
      condition: "used", isNew: false, isFeatured: false,
      dryWeight: 14500, gvwr: 18050, hitchWeight: 2400, freshWater: 98,
      generator: false, solar: false, awning: true, outdoorKitchen: false, washerDryer: true,
      daysOnMarket: 45,
      description: "The best-selling luxury fifth wheel in America for good reason. The Montana 3855BR is practically a condo on wheels. 4 slides open up to 400 sq ft of living space. Has the bunkhouse option — perfect for full-time families or extended travel.",
      features: ["4 Full Slides", "Bunkhouse", "King Bed", "Washer/Dryer", "Fireplace", "Second Living Room", "Central Vac", "Skylight"],
      images: [
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
      ],
      priceHistory: [
        { date: "2024-06-01", price: 59500 }, { date: "2024-08-01", price: 55000 },
        { date: "2024-10-01", price: 50000 }, { date: "2025-01-01", price: 47500 }
      ],
    },
    {
      title: "2025 Jayco Jay Feather 25RB – Brand New, Unregistered",
      make: "Jayco", model: "Jay Feather 25RB", year: 2025, type: "travel_trailer",
      price: 36750, marketValue: 41200, dealScore: "great_deal", dealSavings: 4450,
      length: 29, slides: 1, sleeps: 6, mileage: 0,
      location: "Wixom, MI", state: "MI",
      dealerId: mi.id, dealerName: mi.name,
      condition: "new", isNew: true, isFeatured: false,
      dryWeight: 6785, gvwr: 9995, hitchWeight: 1320, freshWater: 57,
      generator: false, solar: false, awning: true, outdoorKitchen: false, washerDryer: false,
      daysOnMarket: 2,
      description: "End of season dealer clearance on a brand new, never-titled 2025 Jayco Jay Feather. One of America's most trusted brands at a steep discount. This model features Jayco's Magnum Truss roof system (limited lifetime warranty), slide-out kitchen, and the popular rear bath floorplan.",
      features: ["Magnum Truss Roof (Lifetime Warranty)", "Slide-Out Dining/Living", "Rear Bath", "Outside Shower", "Bluetooth Speakers", "USB Charging Stations"],
      images: [
        "https://images.unsplash.com/photo-1510137600163-2729bc6959b0?w=800&q=80",
      ],
      priceHistory: [
        { date: "2025-03-01", price: 41200 }, { date: "2025-03-10", price: 36750 }
      ],
    },
    {
      title: "2019 Newmar Dutch Star 4018 Luxury Diesel Pusher",
      make: "Newmar", model: "Dutch Star 4018", year: 2019, type: "class_a",
      price: 249500, marketValue: 235000, dealScore: "high_price", dealSavings: 0,
      length: 40, slides: 4, sleeps: 4, mileage: 52000,
      location: "Burlington, VT", state: "VT",
      dealerId: vt.id, dealerName: vt.name,
      condition: "used", isNew: false, isFeatured: false,
      dryWeight: 40500, gvwr: 47200, hitchWeight: 0, freshWater: 130,
      generator: true, solar: false, awning: true, outdoorKitchen: false, washerDryer: true,
      daysOnMarket: 67,
      description: "The Dutch Star was Newmar's flagship for decades. This 2019 has been well maintained with full service records. Features the optional raised rail chassis, Freightliner tag axle, and the ultra-rare Aqua Hot diesel hydronic heating system. Motivated seller — recently dropped $30K.",
      features: ["Freightliner Tag Axle", "Aqua Hot Hydronic Heat", "Full-Body Paint", "4 Slides", "Residential Refrigerator", "Washer/Dryer", "Auto-Level"],
      images: [
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
      ],
      priceHistory: [
        { date: "2024-06-01", price: 279000 }, { date: "2024-09-01", price: 265000 },
        { date: "2024-12-01", price: 249500 }
      ],
    },
    {
      title: "2023 Outdoors RV Creek Side 20QBS Toy Hauler",
      make: "Outdoors RV", model: "Creek Side 20QBS", year: 2023, type: "toy_hauler",
      price: 39900, marketValue: 43500, dealScore: "good_deal", dealSavings: 3600,
      length: 22, slides: 0, sleeps: 4, mileage: 0,
      location: "Denver, CO", state: "CO",
      dealerId: co.id, dealerName: co.name,
      condition: "used", isNew: false, isFeatured: false,
      dryWeight: 7150, gvwr: 9995, hitchWeight: 1200, freshWater: 40,
      generator: false, solar: true, awning: true, outdoorKitchen: false, washerDryer: false,
      daysOnMarket: 15,
      description: "Outdoors RV is the Pacific Northwest's best kept secret — built tougher than anyone else for year-round, serious adventure camping. This Creek Side Toy Hauler fits 2 dirt bikes or 1 side-by-side. Comes from the factory with 4-seasons readiness and a serious build quality.",
      features: ["4-Season Package", "400W Solar", "2000W Inverter", "Garage w/Ramp Door", "Outside Kitchen Stub", "Aluminum Frame", "Built in CO for Mountains"],
      images: [
        "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&q=80",
      ],
      priceHistory: [
        { date: "2025-01-01", price: 43500 }, { date: "2025-02-15", price: 39900 }
      ],
    },
    {
      title: "2020 coachmen Viking Ultra-Lite 17BHS Popup Camper",
      make: "Coachmen", model: "Viking Ultra-Lite 17BHS", year: 2020, type: "popup_camper",
      price: 9900, marketValue: 13500, dealScore: "great_deal", dealSavings: 3600,
      length: 17, slides: 0, sleeps: 8, mileage: 0,
      location: "Phoenix, AZ", state: "AZ",
      dealerId: az.id, dealerName: az.name,
      condition: "used", isNew: false, isFeatured: false,
      dryWeight: 2950, gvwr: 4205, hitchWeight: 440, freshWater: 22,
      generator: false, solar: false, awning: false, outdoorKitchen: false, washerDryer: false,
      daysOnMarket: 28,
      description: "The perfect entry-point to camping! This popup camper folds down to just 6 feet tall — easy to tow with any SUV or small truck. Sleeps the whole family with two end beds, a dinette bed, and the bunk option. All canvas in excellent shape with no mildew or tears.",
      features: ["Sleeps 8", "Full Kitchen", "3-Burner Stove", "Fold-Down Dinette", "End Bunks", "Stabilizer Jacks", "100% Clean Canvas"],
      images: [
        "https://images.unsplash.com/photo-1464217079751-71d1f93e44a0?w=800&q=80",
      ],
      priceHistory: [
        { date: "2025-01-01", price: 13500 }, { date: "2025-02-01", price: 11000 },
        { date: "2025-03-01", price: 9900 }
      ],
    },
  ]);

  console.log("Seed complete! Inserted", dealers.length, "dealers and 12 listings.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
