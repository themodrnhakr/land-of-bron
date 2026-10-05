# User Notes

## Tile Name/Type Schemas

I have a few notes here. First, I want to rename some of the schema types. I'll review them below.

- **nationTerrainIdsSchema**
- **nationTerrainSchema**
- **borderTerrainIdsSchema**
- **borderTerrainSchema**
- **allTerrainIdsSchemas**
- **allTerrainSchemas**

### nationTerrainIdsSchema/nationTerrainSchema

These schemas should combine to describe all possible nation tile terrain types. The number, name, and other attributes should all be configurable. The ID schemas can be used as lookups for the configuration schemas.

Each terrain type will have a number of attributes that can be tweaked:

- Tile name
- Population
- Population display text
- Movement
- Movement display text
- Some form of asset id
- Tile count (the number of tiles of this terrain type each nation will have)

To reiterate, the number of terrain types as well as each terrain types' attributes should be configurable, and said configuration should probably be injected via the Effect.ts Config module.

### borderTerrainIdsSchema/borderTerrainSchema

This is where "sea" will be. The ids should be hardcoded, but there should be space for attributes to be added in the future. That way game features can be tweaked on the fly.

### allTerrainIdsSchemas/allTerrainSchemas

Should be a union of the two.

## Embassy

Should also be an array of multiple embassies. Each player should have one embassy for each other player in the game (so this is dependant on how many players there are in a particular game).

## Terrain generation/selection

Currently, it appears that terrain is intended to be set to "plains" by default. I see `DEFAULT_LAND_TERRAIN` appears to be dictating this.

This misunderstands the model. Each terrain has a "Tile count" (as discussed above), which indicates how many tiles of that terrain type each player has. Terrain selection should randomly select the target number of tiles from their pool of possible tiles, and these will be randomly placed at the tile coords of their nation. I don't think this involves any special configuration other than what I've already indicated is necessary.

## D27 - production.kind

Ok, so I missed some stuff here. Each tile has an associated resource (or set of resources). Resources have two tiers: Tier I (Basic Resources) can be collected directly from terrain tiles using production facilites (farms, mines, etc.); and Tier II (Advanced Resources) are made using advanced production facilites that require basic resources to construct.

We've got a couple things here:

### Resources

- Tier (1 or 2)
- Name

### Production

- Name
- Tier
- Resource cost (array of resources)
- Resource produced (Array of Arrays, if the parent array has more than one child array this means that you can choose between different sets of resources to be produced each turn)

### Changes to `Tile`

- Buildable production kinds (array)

## Defense infrastructure

A structure that can be built to improve a tile's defense capabilities.

- Name
- Resource cost
- Defense points

## Transportation

A few kinds I can think of right now, railroads, supply lines, ships, and ports.

### Railroads

Railroads are placed at the connection between two faces of a hexagonal tile (much like raods in Catan).

- Resource cost
- Coordinates (not sure the best way to mark where these are placed)

### Supply lines

Supply lines are placed in a tile.

- Resource cost
- Maintenance cost (an ongoing cost spent to keep supply lines on the board)

### Ports

Ports are placed at a junction between the face of a nation terrain tile and a sea terrain tile.

- Resource cost
- Ship capacity

### Ships

Ships have two types, mercantile and naval. They serve various economic an military functions that can be figured out later.

- Type (merchant or navy)
