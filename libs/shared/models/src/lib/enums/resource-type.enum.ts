export enum ResourceType {
    RowingBoat,
    Boat,
    Car,
    Locker,
    Key,
    RealEstate,
    Other,
}

/* 
later ?:
    Bike,
    Motorcycle,
    Airplane,
    Tool,
    Electronics,
    Furniture,
    Clothing,
    Jewelry,
    Art,
    Book,
    Music,
    Movie,
    Game,
    Toy,
    Sport,
    Food,
    Drink,
    Plant,
    Animal,
    Medicine,
    Cosmetic,
    Hygiene,
    Cleaning,
    Experience,
    Skills,
    Natural,
    Technology,
    Capital,
    Economic,
    Human,
    ManMade
}
*/
// see: https://www.geeksforgeeks.org/types-of-resources/

export enum BikeType {
  MountainBike,
  RoadBicyle,
  FoldingBicycle,
  CargoBike,
  FatBike,
  ElectricBike,
  GravelBike,
  Bmx,
  Cruiser,
  CityBike,
  Tandem,
  Recumbent,
  TouringBike,
  FixedGear
}

export enum MotorcycleType {
  Cruiser,
  Enduro,
  Adventure,
  Sport,
  Touring,
  Scooter
}

export enum AirplaneType {
  Glider,
  MotorGlider,
  Ultralight,
  Helicopter,
  Cargo,
  Amphibious,
  FighterJet,
  Bomber,
  PassengerJet,
  PrivateJet,
  Airship,
  Balloon,
  Drone
}

export enum RealEstateType {
  Commercial,
  Residential,
  Industrial,
  Agricultural,
  Land,
  Office,
  Retail,
  Warehouse,
  Apartment,
  House,
  Villa,
  Mansion,
  Castle,
  Farm,
  Ranch,
  Hotel,
  Resort,
  Hospital,
  School,
  Church,
  Mosque,
  Temple,
  Synagogue,
  Museum,
  Library,
  Theater,
  Stadium,
  Arena,
  Factory,
  Workshop,
  Garage,
  Hangar,
  Barn,
  Silo,
  Greenhouse,
  Storage,
  Parking,
  Shelter,
  Bunker,
  Lighthouse,
  Tower,
  Bridge,
  Tunnel,
  Dam,
  Canal,
  Aqueduct,
  Fountain,
  Monument,
  Statue,
  Sculpture,
  Park,
  Garden,
  Zoo,
  Aquarium,
  BotanicalGarden,
  NatureReserve,
  Forest
}

export enum ElectronicsType {
  Computer,
  Laptop,
  Tablet,
  Smartphone,
  Smartwatch,
  Headphones,
  Speaker,
  Microphone,
  Camera,
  Camcorder,
  Drone,
  Printer,
  Scanner,
  Monitor,
  Tv,
  Projector,
  GameConsole,
  NetworkDevice,
  StorageDevice
}

// 2 taxonomies: soft/hard,  transferrable/personal/knowledge
export enum SkillsType {
  Soft,             // emotional intelligence, communication, adaptibility, e.g. patience, communication, empathy, cultural, multitasking
  Hard,             // specific, teachable, measurable, job-specific abilities (= knowledge), e.g. language, programming, cooking, design, teaching
  Transferrable,    // applicable across different jobs and industries, e.g. communication, organization, analytical thinking, critical thinking, computing, writing
  Personal,         // individual's innate abilities and character traits, e.g. independence, integrity, patience, compassion, assertiveness, creativity, resilience
  Knowledge         // acquired through learning & education, e.g. programming, copywriting, seo, driving
}

export enum NaturalResourcetype {
  Energy,
  Fuel,
  Water,
  Air,
  Land,
  Forest,
  Biological,
  Mineral
}