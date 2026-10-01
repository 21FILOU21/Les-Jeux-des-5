"use strict";

/* ============================================================
   Créateur de maps 2D — données séparées du jeu + runtime
   Étend l'overworld existant; ne duplique ni combat, ni monstres,
   ni objets joueur.
============================================================ */

const MAP_EDITOR_STORAGE_KEY = "lesJeuxDes5.maps.v1";
const MAP_EDITOR_ACTIVE_KEY = "lesJeuxDes5.activeMapId";
const MAP_EDITOR_INTERACTIVE_STORAGE_KEY = "lesJeuxDes5.interactiveTiles.v1";
const MAP_EDITOR_ASSET_STORE = "mapAssets";
const MAP_EDITOR_MAX_COLS = 120;
const MAP_EDITOR_MAX_ROWS = 120;

let mapEditorMaps = [];
let mapEditorActiveId = null;
let mapEditorRuntime = null;
let mapEditorAssetCache = new Map();
let mapEditorUndo = [];
let mapEditorRedo = [];
let mapEditorTool = "paint";
let mapEditorSelectedTile = null;
let mapEditorActiveLayerId = "terrain";
let mapEditorMode = "placement";
let mapEditorSelectedInstanceId = null;
let mapEditorHoveredInstanceId = null;
let mapEditorInteractiveDefinitions = [];
let mapEditorDragging = false;
let mapEditorPan = null;
let mapEditorPointerMode = null;
let mapEditorPointerTool = null;
let mapEditorTestMode = false;
let mapEditorTestSnapshot = null;
let mapEditorOpenedObjectIds = new Set();

const MAP_EDITOR_DEFAULT_TILES = [
    { id:"grass", name:"Herbe", collision:false, terrainType:"grass", encounters:true, description:"Terrain traversable.", imageKey:null, fallback:"#8fbf6a" },
    { id:"tree", name:"Arbre", collision:true, terrainType:"obstacle", encounters:false, description:"Obstacle infranchissable.", imageKey:null, fallback:"#285a34" },
    { id:"tall-grass", name:"Hautes herbes", collision:false, terrainType:"grass", encounters:true, description:"Zone de rencontres.", imageKey:null, fallback:"#4c8d43" }
];

const MAP_EDITOR_EMPTY_TILE_ID = "VIDE";
const MAP_EDITOR_EMPTY_TILE = Object.freeze({
    id: MAP_EDITOR_EMPTY_TILE_ID,
    name: "VIDE",
    collision: false,
    terrainType: "empty",
    encounters: false,
    interactive: false,
    description: "Case vide traversable, sans interaction ni rencontre.",
    imageKey: null,
    fallback: "#777777"
});

function mapEditorGetEmptyTile() {
    return MAP_EDITOR_EMPTY_TILE;
}

function mapEditorIsValidTileId(id) {
    const value = String(id ?? "");
    return value === MAP_EDITOR_EMPTY_TILE_ID || !!mapEditorFindTileDefinition(value);
}

function mapEditorFindTileDefinition(id) {
    const tileId = String(id ?? "");
    const m = mapEditorCurrent?.();
    const local = m?.tileDefinitions?.find(t => t && t.id === tileId);
    if (local) return local;
    const interactive = mapEditorInteractiveDefinitions.find(t => t && t.id === tileId);
    if (interactive) return interactive;
    return MAP_EDITOR_DEFAULT_TILES.find(t => t.id === tileId) || null;
}

function getMapEditorItemCatalog() {
    if (typeof getInventoryItemDefinitions === "function") {
        return getInventoryItemDefinitions().map(item => ({ id: item.Id, label: item.Nom }));
    }

    return [];
}

function mapEditorNormalizeInteractiveDefinition(definition) {
    const d=mapEditorClone(definition||{});
    d.id=mapEditorNormalizeId(d.id,mapEditorUid("interactive"));
    d.name=String(d.name||d.id);
    d.kind=String(d.kind||"container");
    d.collision=d.collision!==false;
    d.terrainType="interactive";
    d.encounters=false;
    d.description=String(d.description||"Objet interactif.");
    d.fallback=String(d.fallback||"#b9823d");
    d.imageKey=d.imageKey||d.interactive?.closedImageKey||null;
    d.interactive=Object.assign({
        type:d.kind,
        collision:d.collision,
        closedImageKey:null,
        openImageKey:null,
        lootTable:[],
        initialOpen:false
    },d.interactive||{});
    d.interactive.lootTable=Array.isArray(d.interactive.lootTable)?d.interactive.lootTable.map(e=>({
        itemId:String(e?.itemId||""),
        chance:Math.max(0,Math.min(100,Number(e?.chance)||0)),
        min:Math.max(1,Math.floor(Number(e?.min)||1)),
        max:Math.max(1,Math.floor(Number(e?.max)||1))
    })).filter(e=>e.itemId):[];
    d.imageKey=d.interactive.closedImageKey||d.imageKey||null;
    return d;
}

function mapEditorLoadInteractiveDefinitions(){
    try {
        const raw=localStorage.getItem(MAP_EDITOR_INTERACTIVE_STORAGE_KEY);
        mapEditorInteractiveDefinitions=raw?JSON.parse(raw).map(mapEditorNormalizeInteractiveDefinition):[];
    } catch(e) {
        console.error("Tuiles interactives invalides :",e);
        mapEditorInteractiveDefinitions=[];
    }
}

function mapEditorPersistInteractiveDefinitions(){
    localStorage.setItem(MAP_EDITOR_INTERACTIVE_STORAGE_KEY,JSON.stringify(mapEditorInteractiveDefinitions));
}

function mapEditorRegisterInteractiveDefinition(definition){
    const normalized=mapEditorNormalizeInteractiveDefinition(definition);
    const index=mapEditorInteractiveDefinitions.findIndex(d=>d.id===normalized.id);
    if(index>=0)mapEditorInteractiveDefinitions[index]=normalized;
    else mapEditorInteractiveDefinitions.push(normalized);
    mapEditorPersistInteractiveDefinitions();
    return normalized;
}

function mapEditorFindInteractiveDefinition(id){
    const tileId=String(id||"");
    const m=mapEditorCurrent();
    const local=m?.tileDefinitions?.find(t=>t.id===tileId&&t.interactive);
    if(local)return mapEditorNormalizeInteractiveDefinition(local);
    return mapEditorInteractiveDefinitions.find(d=>d.id===tileId)||null;
}

function mapEditorInteractiveDefinitionFromObject(o){
    if(!o)return null;
    const definition=mapEditorFindInteractiveDefinition(o.definitionId);
    if(definition)return definition;
    if(o.type!=="container")return null;
    return mapEditorNormalizeInteractiveDefinition({
        id:mapEditorNormalizeId("legacy-"+(o.id||mapEditorUid("chest")),mapEditorUid("interactive")),
        name:o.name||"Coffre",
        kind:"container",
        collision:o.collision!==false,
        interactive:{
            type:"container",
            collision:o.collision!==false,
            closedImageKey:o.closedImageKey||null,
            openImageKey:o.openImageKey||null,
            lootTable:Array.isArray(o.lootTable)?o.lootTable:[],
            initialOpen:!!o.opened
        }
    });
}

function mapEditorEnsureInteractiveDefinitionInMap(m,definition){
    if(!m||!definition)return null;
    const normalized=mapEditorNormalizeInteractiveDefinition(definition);
    if(!Array.isArray(m.tileDefinitions))m.tileDefinitions=[];
    const index=m.tileDefinitions.findIndex(t=>t.id===normalized.id);
    if(index>=0)m.tileDefinitions[index]=normalized;
    else m.tileDefinitions.push(normalized);
    mapEditorRegisterInteractiveDefinition(normalized);
    return normalized;
}

function mapEditorNormalizeInteractiveInstance(m,o,index){
    const source=mapEditorClone(o||{});
    source.type=source.type||"container";
    source.instanceId=String(source.instanceId||source.id||mapEditorUid("instance"));
    source.id=source.instanceId;
    source.x=Math.max(0,Math.min(m.cols-1,Math.floor(Number(source.x)||0)));
    source.y=Math.max(0,Math.min(m.rows-1,Math.floor(Number(source.y)||0)));
    source.overrides=source.overrides&&typeof source.overrides==="object"?source.overrides:{};
    source.state=source.state&&typeof source.state==="object"?source.state:{};
    if(source.type==="container"){
        let definition=(m.tileDefinitions||[]).find(t=>t&&t.id===String(source.definitionId||"")&&t.interactive);
        if(!definition)definition=mapEditorFindInteractiveDefinition(source.definitionId);
        if(!definition){
            definition=mapEditorInteractiveDefinitionFromObject(source);
            definition.id=mapEditorNormalizeId(source.definitionId||("legacy-"+source.instanceId),mapEditorUid("interactive"));
            if(!m.tileDefinitions?.some(t=>t.id===definition.id))mapEditorEnsureInteractiveDefinitionInMap(m,definition);
            source.definitionId=definition.id;
            source.overrides={};
        } else {
            source.definitionId=definition.id;
        }
        source.state.opened=mapEditorOpenedObjectIds.has(source.instanceId)||source.state.opened===true||source.opened===true;
        delete source.opened;
    }
    return source;
}

function mapEditorNormalizeAllInteractiveInstances(m){
    const seen=new Set();
    const objects=Array.isArray(m.objects)?m.objects:[];
    m.objects=objects.map((o,i)=>{
        const instance=mapEditorNormalizeInteractiveInstance(m,o,i);
        if(seen.has(instance.instanceId))instance.instanceId=mapEditorUid("instance");
        instance.id=instance.instanceId;seen.add(instance.instanceId);
        return instance;
    });
    return m;
}

function mapEditorGetInstanceDefinition(instance){
    return mapEditorFindInteractiveDefinition(instance?.definitionId);
}

function mapEditorGetInstanceProps(instance){
    const definition=mapEditorGetInstanceDefinition(instance);
    const base=definition?.interactive||{};
    const overrides=instance?.overrides||{};
    return Object.assign({},base,overrides,{
        lootTable:Array.isArray(overrides.lootTable)?overrides.lootTable:(Array.isArray(base.lootTable)?base.lootTable:[]),
        collision:overrides.collision!==undefined?overrides.collision:base.collision!==false
    });
}

function mapEditorIsInteractiveTile(tileId){
    return !!mapEditorFindInteractiveDefinition(tileId);
}

function mapEditorGetInstanceAtCell(col,row){
    const m=mapEditorCurrent();
    return m?.objects?.find(o=>Number(o.x)===Number(col)&&Number(o.y)===Number(row))||null;
}

function mapEditorCreateInteractiveInstance(definition,col,row){
    const m=mapEditorCurrent();if(!m)return null;
    const d=mapEditorEnsureInteractiveDefinitionInMap(m,definition);
    const existing=mapEditorGetInstanceAtCell(col,row);
    if(existing)return existing;
    const instance={
        id:mapEditorUid("instance"),
        instanceId:"",
        definitionId:d.id,
        type:d.kind||"container",
        x:Math.max(0,Math.min(m.cols-1,col)),
        y:Math.max(0,Math.min(m.rows-1,row)),
        overrides:{},
        state:{opened:!!d.interactive.initialOpen}
    };
    instance.instanceId=instance.id;
    m.objects=Array.isArray(m.objects)?m.objects:[];
    m.objects.push(instance);
    if(instance.state.opened)mapEditorOpenedObjectIds.add(instance.instanceId);
    return instance;
}

function mapEditorGetEffectiveInstanceImage(instance,opened=false){
    const props=mapEditorGetInstanceProps(instance);
    return opened?props.openImageKey:props.closedImageKey;
}

function mapEditorUid(prefix="id") {
    return prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9);
}

function mapEditorClone(value) {
    return structuredClone(value);
}

function mapEditorNormalizeId(value, fallback) {
    const id = String(value || "").trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"");
    return id || fallback;
}

function mapEditorDefaultMap() {
    const cols=Array.isArray(mapData)&&mapData.length?mapData[0].length:30;
    const rows=Array.isArray(mapData)&&mapData.length?mapData.length:20;
    const cells=Array(cols*rows).fill("grass");
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
        const legacy=Array.isArray(mapData?.[y])?mapData[y][x]:0;
        cells[y*cols+x]=legacy===1?"tree":legacy===2?"tall-grass":"grass";
    }
    return {
        version:1, id:"map-principale", name:"Carte principale", description:"",
        cols, rows, tileSize:16, tileset:["grass","tree","tall-grass"],
        layers:[{id:"terrain",name:"Terrain",visible:true,cells}],
        encounters:[{id:"enc-herbes",name:"Rencontres des hautes herbes",chance:12,tiles:["tall-grass"],monsters:[],minLevel:1,maxLevel:100}],
        spawn:{x:Math.floor(cols/2),y:Math.floor(rows/2)},
        objects:[],
        metadata:{createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
    };
}

function mapEditorNormalizeMapTileReferences(m){
    if(!m)return m;
    const validIds=new Set([
        MAP_EDITOR_EMPTY_TILE_ID,
        ...MAP_EDITOR_DEFAULT_TILES.map(t=>t.id),
        ...(m.tileDefinitions||[]).map(t=>t?.id).filter(Boolean),
        ...mapEditorInteractiveDefinitions.map(t=>t?.id).filter(Boolean)
    ]);
    for(const layer of m.layers||[]){
        layer.cells=(layer.cells||[]).map(cell=>validIds.has(String(cell ?? ""))?String(cell):MAP_EDITOR_EMPTY_TILE_ID);
    }
    m.tileset=(m.tileset||[]).map(id=>validIds.has(String(id))?String(id):MAP_EDITOR_EMPTY_TILE_ID).filter((id,i,a)=>id!==MAP_EDITOR_EMPTY_TILE_ID||a.indexOf(id)===i);
    return m;
}

function normalizeMapEditorMap(map) {
    const m=mapEditorClone(map||mapEditorDefaultMap());
    m.version=1;
    m.id=mapEditorNormalizeId(m.id,mapEditorUid("map"));
    m.name=String(m.name||m.id);
    m.cols=Math.max(1,Math.min(MAP_EDITOR_MAX_COLS,Math.floor(Number(m.cols)||30)));
    m.rows=Math.max(1,Math.min(MAP_EDITOR_MAX_ROWS,Math.floor(Number(m.rows)||20)));
    m.tileSize=16;
    m.tileset=Array.isArray(m.tileset)?m.tileset.map(String):["grass"];
    m.tileDefinitions=Array.isArray(m.tileDefinitions)?m.tileDefinitions:[];
    m.layers=Array.isArray(m.layers)?m.layers:[];
    if(!m.layers.length)m.layers=[{id:"terrain",name:"Terrain",visible:true,cells:[]}];
    m.layers=m.layers.map((layer,i)=>({
        id:String(layer.id||"layer-"+i),name:String(layer.name||"Calque "+(i+1)),
        visible:layer.visible!==false,
        cells:Array.isArray(layer.cells)?layer.cells.slice(0,m.cols*m.rows):[]
    }));
    for(const layer of m.layers){while(layer.cells.length<m.cols*m.rows)layer.cells.push(m.tileset[0]||"grass");}
    m.encounters=Array.isArray(m.encounters)?m.encounters:[];
    m.objects=Array.isArray(m.objects)?m.objects:[];
    mapEditorNormalizeAllInteractiveInstances(m);
    m.spawn=m.spawn&&Number.isInteger(m.spawn.x)&&Number.isInteger(m.spawn.y)?m.spawn:{x:Math.floor(m.cols/2),y:Math.floor(m.rows/2)};
    m.spawn.x=Math.max(0,Math.min(m.cols-1,m.spawn.x));m.spawn.y=Math.max(0,Math.min(m.rows-1,m.spawn.y));
    m.metadata=m.metadata||{};
    mapEditorNormalizeMapTileReferences(m);
    return m;
}

function mapEditorLoadMaps(){
    mapEditorLoadInteractiveDefinitions();
    try {
        const raw=localStorage.getItem(MAP_EDITOR_STORAGE_KEY);
        mapEditorMaps=raw?JSON.parse(raw).map(normalizeMapEditorMap):[];
    } catch(e){ console.error("Maps invalides :",e); mapEditorMaps=[]; }
    if(!mapEditorMaps.length) mapEditorMaps=[mapEditorDefaultMap()];
    mapEditorActiveId=localStorage.getItem(MAP_EDITOR_ACTIVE_KEY)||mapEditorMaps[0].id;
    if(!mapEditorMaps.some(m=>m.id===mapEditorActiveId))mapEditorActiveId=mapEditorMaps[0].id;
}

function mapEditorPersist(){
    localStorage.setItem(MAP_EDITOR_STORAGE_KEY,JSON.stringify(mapEditorMaps));
    if(mapEditorActiveId)localStorage.setItem(MAP_EDITOR_ACTIVE_KEY,mapEditorActiveId);
}

function mapEditorCurrent(){return mapEditorMaps.find(m=>m.id===mapEditorActiveId)||mapEditorMaps[0]||null;}

function mapEditorSaveCurrent(){
    const m=mapEditorCurrent(); if(!m)return;
    mapEditorNormalizeAllInteractiveInstances(m);
    m.metadata.updatedAt=new Date().toISOString();
    mapEditorPersist();
    mapEditorPersistInteractiveDefinitions();
}

function mapEditorFindTile(id){
    const tileId=String(id ?? "");
    if(tileId===MAP_EDITOR_EMPTY_TILE_ID)return MAP_EDITOR_EMPTY_TILE;
    const definition=mapEditorFindTileDefinition(tileId);
    return definition || MAP_EDITOR_EMPTY_TILE;
}

function mapEditorAllTiles(){
    const m=mapEditorCurrent();
    const custom=Array.isArray(m?.tileDefinitions)?m.tileDefinitions:[];
    const globalInteractive=mapEditorInteractiveDefinitions;
    const byId=new Map();
    [...MAP_EDITOR_DEFAULT_TILES,...globalInteractive,...custom].forEach(t=>byId.set(t.id,t));
    byId.delete(MAP_EDITOR_EMPTY_TILE_ID);
    return [...byId.values()];
}

async function mapEditorOpenAssetDb(){
    if(typeof openSaveDatabase!=="function")return null;
    try{return await openSaveDatabase();}catch(e){console.warn("IndexedDB assets maps :",e);return null;}
}

async function mapEditorPutAsset(key,dataUrl){
    const db=await mapEditorOpenAssetDb(); if(!db)return;
    await new Promise((resolve,reject)=>{
        const tx=db.transaction(MAP_EDITOR_ASSET_STORE,"readwrite");
        tx.objectStore(MAP_EDITOR_ASSET_STORE).put(dataUrl,key);
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    }); db.close(); mapEditorAssetCache.set(key,dataUrl);
}

async function mapEditorGetAsset(key){
    if(!key)return null;
    if(mapEditorAssetCache.has(key))return mapEditorAssetCache.get(key);
    const db=await mapEditorOpenAssetDb();if(!db)return null;
    const value=await new Promise((resolve,reject)=>{
        const tx=db.transaction(MAP_EDITOR_ASSET_STORE,"readonly");
        const req=tx.objectStore(MAP_EDITOR_ASSET_STORE).get(key);
        req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });db.close();
    if(value)mapEditorAssetCache.set(key,value);
    return value;
}

async function mapEditorImportImage(file){
    if(!file)throw new Error("Aucun fichier.");
    if(!["image/png","image/jpeg","image/jpg"].includes(file.type))throw new Error("PNG ou JPG uniquement.");
    if(file.size>8*1024*1024)throw new Error("Image trop volumineuse (8 Mo maximum).");
    const dataUrl=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);
    });
    const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error("Image invalide."));image.src=dataUrl;});
    const key="asset-"+mapEditorUid("img");
    await mapEditorPutAsset(key,dataUrl);
    return {key,width:image.naturalWidth,height:image.naturalHeight};
}

function mapEditorPushUndo(){
    const m=mapEditorCurrent();if(!m)return;
    mapEditorUndo.push(mapEditorClone(m));if(mapEditorUndo.length>60)mapEditorUndo.shift();mapEditorRedo=[];
}

function mapEditorRestore(snapshot){
    if(!snapshot)return;
    const i=mapEditorMaps.findIndex(m=>m.id===snapshot.id);
    if(i>=0){mapEditorMaps[i]=normalizeMapEditorMap(snapshot);mapEditorActiveId=snapshot.id;mapEditorPersist();mapEditorApplyRuntime();mapEditorRender();}
}

function mapEditorUndoAction(){
    const m=mapEditorCurrent();if(!m||!mapEditorUndo.length)return;
    mapEditorRedo.push(mapEditorClone(m));mapEditorRestore(mapEditorUndo.pop());
}
function mapEditorRedoAction(){
    const m=mapEditorCurrent();if(!m||!mapEditorRedo.length)return;
    mapEditorUndo.push(mapEditorClone(m));mapEditorRestore(mapEditorRedo.pop());
}

function mapEditorTopLayer(){const m=mapEditorCurrent();return m?.layers?.find(l=>l.id===mapEditorActiveLayerId)||m?.layers?.[0]||null;}

function mapEditorApplyRuntime(requestedId){
    const target=requestedId||mapEditorActiveId;
    const m=mapEditorMaps.find(x=>x.id===target)||mapEditorCurrent();
    if(!m)return;
    mapEditorActiveId=m.id;mapEditorActiveLayerId=m.layers.find(l=>l.visible)?.id||m.layers[0]?.id||"terrain";mapEditorPersist();
    mapEditorRuntime=m;
    mapEditorOpenedObjectIds=new Set((m.objects||[]).filter(o=>o.state?.opened===true).map(o=>o.instanceId||o.id));
    MAP_COLS=m.cols;MAP_ROWS=m.rows;MAP_WIDTH=MAP_COLS*TILE_SIZE;MAP_HEIGHT=MAP_ROWS*TILE_SIZE;
    WORLD_START_X=m.spawn.x*TILE_SIZE;WORLD_START_Y=m.spawn.y*TILE_SIZE;
    const visibleLayers=m.layers.filter(l=>l.visible!==false);
    worldMap=[];
    for(let y=0;y<m.rows;y++){
        const row=[];
        for(let x=0;x<m.cols;x++){
            let tileId=m.tileset[0]||"grass";
            for(const layer of visibleLayers){
                const candidate=layer.cells?.[y*m.cols+x];
                if(candidate!==null&&candidate!==undefined&&candidate!=="")tileId=candidate;
            }
            row.push(tileId);
        }
        worldMap.push(row);
    }
    while(worldMap.length<m.rows)worldMap.push(Array(m.cols).fill(m.tileset[0]||"grass"));
    if(typeof buildWorldMapCanvas==="function")worldMapCanvas=buildWorldMapCanvas();
    if(worldCanvas){worldCanvas.width=VIEWPORT_WIDTH;worldCanvas.height=VIEWPORT_HEIGHT;}
    if(typeof findNearestWalkablePosition==="function"&&!isWorldWalkablePixel(WORLD_START_X,WORLD_START_Y)){
        const safe=findNearestWalkablePosition(WORLD_START_X,WORLD_START_Y);
        WORLD_START_X=safe.x;WORLD_START_Y=safe.y;
    }
    if(typeof resetOverworldState==="function")resetOverworldState();
}

function loadActiveMapIntoWorld(id){
    if(!mapEditorMaps.length)mapEditorLoadMaps();
    if(id)mapEditorActiveId=id;
    mapEditorApplyRuntime();
}

function drawMapEditorRuntimeTile(ctx,type,S){
    if(typeof type==="number")return false;
    const tile=mapEditorFindTile(type);
    if(!tile)return false;
    ctx.fillStyle=tile.fallback||"#777";ctx.fillRect(0,0,S,S);
    const data=tile.imageKey?mapEditorAssetCache.get(tile.imageKey):null;
    if(data){
        const img=mapEditorRuntimeImages.get(tile.imageKey);
        if(img&&img.complete)ctx.drawImage(img,0,0,S,S);
    } else if(tile.terrainType==="water"){
        ctx.fillStyle="#4b82a5";ctx.fillRect(0,0,S,S);
    } else if(tile.terrainType==="obstacle"){
        ctx.fillStyle="#285a34";ctx.fillRect(0,0,S,S);
        ctx.fillStyle="rgba(255,255,255,.12)";ctx.fillRect(S*.25,S*.2,S*.5,S*.55);
    } else if(tile.terrainType==="grass"){
        ctx.fillStyle="rgba(255,255,255,.06)";ctx.fillRect(0,0,S,S);
    }
    return true;
}
const mapEditorRuntimeImages=new Map();

function drawMapEditorRuntimeObjects(ctx,S){
    const m=mapEditorCurrent(); if(!m)return;
    for(const o of m.objects||[]){
        const props=mapEditorGetInstanceProps(o);
        const opened=mapEditorOpenedObjectIds.has(o.instanceId)||o.state?.opened===true;
        const key=mapEditorGetEffectiveInstanceImage(o,opened);
        const img=key?mapEditorRuntimeImages.get(key):null;
        const x=o.x*S,y=o.y*S;
        if(img&&img.complete)ctx.drawImage(img,x,y,S,S);
        else if(o.type==="container"){ctx.fillStyle=opened?"#654b2d":"#b87b37";ctx.fillRect(x+S*.12,y+S*.28,S*.76,S*.55);ctx.fillStyle="#e0b34f";ctx.fillRect(x+S*.42,y+S*.44,S*.16,S*.18);}
    }
}

async function mapEditorLoadRuntimeImages(){
    const objectKeys=(mapEditorCurrent()?.objects||[]).flatMap(o=>{const p=mapEditorGetInstanceProps(o);return [p.closedImageKey,p.openImageKey];}).filter(Boolean);
    for(const key of objectKeys){
        if(mapEditorRuntimeImages.has(key))continue;
        const data=await mapEditorGetAsset(key);if(!data)continue;
        const img=new Image();img.onload=()=>{mapEditorRuntimeImages.set(key,img);if(typeof buildWorldMapCanvas==="function"){worldMapCanvas=buildWorldMapCanvas();renderWorld();}};img.src=data;
    }
    for(const tile of mapEditorAllTiles()){
        if(!tile.imageKey||mapEditorRuntimeImages.has(tile.imageKey))continue;
        const data=await mapEditorGetAsset(tile.imageKey);if(!data)continue;
        const img=new Image();img.onload=()=>{mapEditorRuntimeImages.set(tile.imageKey,img);if(typeof buildWorldMapCanvas==="function"){worldMapCanvas=buildWorldMapCanvas();renderWorld();}};img.src=data;
    }
}

function isMapEditorRuntimeBlocked(tileId,col,row){
    const obj=mapEditorCurrent()?.objects?.find(o=>o.x===col&&o.y===row);
    if(!obj)return false;
    return mapEditorGetInstanceProps(obj).collision!==false;
}

function mapEditorTileHasEncounter(tileId){
    const m=mapEditorCurrent();
    return !!m?.encounters?.some(e=>Array.isArray(e.tiles)&&e.tiles.includes(String(tileId))&&Number(e.chance)>0&&Array.isArray(e.monsters)&&e.monsters.length);
}

function mapEditorWeighted(list){
    const valid=list.filter(e=>e&&Number(e.weight)>0);
    const total=valid.reduce((s,e)=>s+Number(e.weight),0);
    if(!total)return null;
    let r=Math.random()*total;for(const e of valid){r-=Number(e.weight);if(r<=0)return e;}return valid[valid.length-1];
}

function mapEditorResolveMonster(id){
    const pool=state?.contenu?.Monstres||[];
    return pool.find(m=>String(m.Nom||m.id||"")===String(id))||null;
}

function mapEditorPickEncounter(col,row){
    const m=mapEditorCurrent();if(!m)return null;
    const tileId=worldMap[row]?.[col];
    const tileDefinition=mapEditorFindTile(tileId);
    if(tileDefinition && tileDefinition.encounters!==true)return null;

    const tables=m.encounters.filter(e=>Array.isArray(e.tiles)&&e.tiles.includes(String(tileId)));
    for(const table of tables){
        const chance=Math.max(0,Math.min(100,Number(table.chance)||0));
        if(Math.random()*100>=chance)continue;

        const entry=mapEditorWeighted(table.monsters||[]);
        if(!entry)continue;

        const monster=mapEditorResolveMonster(entry.monsterId);
        if(!monster){
            console.error("Rencontre de map : monstre introuvable :",entry.monsterId);
            continue;
        }

        const min=Math.max(1,Number(table.minLevel)||1,Number(entry.minLevel)||1);
        const max=Math.max(min,Number(table.maxLevel)||min,Number(entry.maxLevel)||min);

        return {
            encounterId:table.id||null,
            mapId:m.id,
            monsterId:monster.Nom||monster.id||entry.monsterId,
            monsterName:monster.Nom||monster.name||entry.monsterId,
            level:Math.floor(min+Math.random()*(max-min+1)),
            count:Math.max(1,Math.floor(Number(entry.count||table.count)||1))
        };
    }

    return null;
}

function tryMapEditorEncounter(col,row){
    const result=mapEditorPickEncounter(col,row);
    if(!result)return false;
    stopOverworldMode();
    overworldState.graceDistance=WORLD_GRACE_TILES*TILE_SIZE;
    showWorldDialogue("Un monstre sauvage apparaît !",1400);
    if(typeof runEncounterTransition==="function")runEncounterTransition(result);
    else setTimeout(()=>{if(typeof triggerWildBattle==="function")triggerWildBattle(result);},450);
    return true;
}

function getMapEditorOverworldSaveData(){
    const m=mapEditorCurrent();
    const opened=new Set(mapEditorOpenedObjectIds);
    for(const o of m?.objects||[])if(o.state?.opened===true)opened.add(o.instanceId||o.id);
    return {mapId:mapEditorActiveId,openedObjectIds:[...opened]};
}

function applyMapEditorOverworldSaveData(data){
    if(data?.mapId)loadActiveMapIntoWorld(data.mapId);
    const m=mapEditorCurrent();if(!m)return;
    const validIds=new Set((m.objects||[]).map(o=>o.id));
    const opened=new Set((Array.isArray(data?.openedObjectIds)?data.openedObjectIds:[]).filter(id=>validIds.has(id)));
    mapEditorOpenedObjectIds=opened;
    for(const o of m.objects||[])if(o.instanceId) { o.state=o.state||{}; o.state.opened=opened.has(o.instanceId); }
}

function mapEditorGrantItem(id,qty){
    qty=Math.max(0,Math.floor(Number(qty)||0));if(!qty)return;
    if(typeof addItemToInventory === "function") addItemToInventory(id,qty);
}

function mapEditorOpenObjectAt(col,row){
    const m=mapEditorCurrent();if(!m)return false;
    const playerCol=Math.floor((overworldState.playerX+TILE_SIZE/2)/TILE_SIZE);
    const playerRow=Math.floor((overworldState.playerY+TILE_SIZE/2)/TILE_SIZE);
    if(Math.abs(playerCol-col)+Math.abs(playerRow-row)!==1)return false;
    const obj=m.objects.find(o=>o.x===col&&o.y===row);if(!obj)return false;
    const props=mapEditorGetInstanceProps(obj);
    if(obj.type!=="container")return true;
    if(mapEditorOpenedObjectIds.has(obj.instanceId)||obj.state?.opened===true){showWorldDialogue("Le coffre est déjà ouvert.",1200);return true;}
    mapEditorOpenedObjectIds.add(obj.instanceId);
    obj.state=obj.state||{};obj.state.opened=true;
    const rewards=[];
    for(const entry of props.lootTable||[]){
        if(Math.random()*100>=Math.max(0,Math.min(100,Number(entry.chance)||0)))continue;
        const min=Math.max(0,Math.floor(Number(entry.min)||0)),max=Math.max(min,Math.floor(Number(entry.max)||min));
        const qty=min+Math.floor(Math.random()*(max-min+1));
        if(qty){mapEditorGrantItem(entry.itemId,qty);rewards.push((getMapEditorItemCatalog().find(x=>x.id===entry.itemId)?.label||entry.itemId)+(qty>1?" ×"+qty:""));}
    }
    mapEditorSaveCurrent();
    mapEditorRender();
    if(typeof buildWorldMapCanvas==="function"){
        worldMapCanvas=buildWorldMapCanvas();
        if(typeof renderWorld==="function")renderWorld();
    }
    showWorldDialogue(rewards.length?"Butin : "+rewards.join(", "):"Le coffre est vide.",2200);
    return true;
}

function mapEditorInteract(){
    const col=Math.floor((overworldState.playerX+TILE_SIZE/2)/TILE_SIZE),row=Math.floor((overworldState.playerY+TILE_SIZE/2)/TILE_SIZE);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(mapEditorOpenObjectAt(col+dx,row+dy))return true;
    return false;
}

function mapEditorValidate(m,tileDefinitions){
    const errors=[];
    if(!m||typeof m!=="object")return ["Map invalide."];
    if(!Number.isInteger(m.cols)||!Number.isInteger(m.rows)||m.cols<1||m.rows<1||m.cols>MAP_EDITOR_MAX_COLS||m.rows>MAP_EDITOR_MAX_ROWS)errors.push("Dimensions invalides.");
    if(m.tileSize!==undefined&&Number(m.tileSize)!==16)errors.push("Taille de tuile incompatible : le runtime utilise 16.");
    if(Object.prototype.hasOwnProperty.call(m,"tileDefinitions")&&!Array.isArray(m.tileDefinitions))errors.push("Catalogue de tuiles invalide.");
    if(!Array.isArray(m.layers)||m.layers.length===0)errors.push("Aucun calque valide.");

    const catalog=Array.isArray(tileDefinitions)
        ?tileDefinitions
        :(Array.isArray(m.tileDefinitions)?m.tileDefinitions:[]);
    const ids=new Set(MAP_EDITOR_DEFAULT_TILES.map(t=>t.id));
    const customIds=new Set();

    for(const tile of catalog){
        if(!tile||typeof tile!=="object"||!tile.id||typeof tile.id!=="string"||!/^[a-z0-9_-]+$/.test(tile.id)){
            errors.push("Définition de tuile invalide.");
            continue;
        }
        if(customIds.has(tile.id))errors.push("ID de tuile personnalisé dupliqué : "+tile.id);
        customIds.add(tile.id);
        ids.add(tile.id);
    }

    if(!Array.isArray(m.tileset))errors.push("Tileset invalide.");
    for(const tileId of m.tileset||[])if(!ids.has(String(tileId)))errors.push("Référence de tuile inconnue dans le tileset : "+tileId);

    for(const layer of m.layers||[]){
        if(!Array.isArray(layer.cells)||layer.cells.length!==m.cols*m.rows)errors.push("Nombre de cellules invalide pour le calque "+(layer.name||layer.id||"?")+".");
        for(const cell of layer.cells||[])if(cell!==null&&cell!==""&&!ids.has(String(cell)))errors.push("Référence de tuile inconnue : "+cell);
    }
    if(!m.spawn||!Number.isInteger(m.spawn.x)||!Number.isInteger(m.spawn.y)||m.spawn.x<0||m.spawn.x>=m.cols||m.spawn.y<0||m.spawn.y>=m.rows)errors.push("Spawn hors carte.");
    const instanceIds=new Set();
    for(const o of m.objects||[]){
        if(!o.id||!o.instanceId||instanceIds.has(String(o.instanceId))||!Number.isInteger(o.x)||!Number.isInteger(o.y)||o.x<0||o.x>=m.cols||o.y<0||o.y>=m.rows)errors.push("Objet hors carte ou ID d’instance invalide.");
        instanceIds.add(String(o.instanceId||o.id||""));
        if(o.definitionId&&!ids.has(String(o.definitionId)))errors.push("Définition interactive introuvable : "+o.definitionId);
    }
    for(const e of m.encounters||[]){
        for(const tileId of e.tiles||[])if(!ids.has(String(tileId)))errors.push("Référence de tuile inconnue dans une rencontre : "+tileId);
        for(const x of e.monsters||[])if(!mapEditorResolveMonster(x.monsterId))errors.push("Monstre introuvable : "+x.monsterId);
    }
    return [...new Set(errors)];
}

async function mapEditorExport(){
    const m=mapEditorCurrent();if(!m)return;
    const data=mapEditorClone(m);data.assets={};
    data.tileDefinitions=(data.tileDefinitions||[]).map(t=>mapEditorFindInteractiveDefinition(t.id)||t);
    const usedInteractiveIds=new Set((m.objects||[]).map(o=>o.definitionId).filter(Boolean));
    for(const id of usedInteractiveIds){
        const definition=mapEditorFindInteractiveDefinition(id);
        if(definition&&!data.tileDefinitions.some(t=>t.id===definition.id))data.tileDefinitions.push(mapEditorClone(definition));
    }
    const keys=new Set();
    for(const t of mapEditorAllTiles())if(t.imageKey)keys.add(t.imageKey);
    for(const o of m.objects||[]){const props=mapEditorGetInstanceProps(o);if(props.closedImageKey)keys.add(props.closedImageKey);if(props.openImageKey)keys.add(props.openImageKey);}
    for(const key of keys){const asset=await mapEditorGetAsset(key);if(asset)data.assets[key]=asset;}
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(m.id||"map")+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}

function mapEditorImport(file){
    return file.text().then(async text=>{
        const raw=JSON.parse(text);
        const importedTileDefinitions=Object.prototype.hasOwnProperty.call(raw,"tileDefinitions")?raw.tileDefinitions:[];
        const rawErrors=mapEditorValidate(raw,importedTileDefinitions);
        if(rawErrors.length)throw new Error(rawErrors.join("\n"));

        const assets=raw.assets||{};
        delete raw.assets;

        for(const [key,dataUrl] of Object.entries(assets)){
            if(typeof dataUrl!=="string"||!dataUrl.startsWith("data:image/"))throw new Error("Image de map invalide : "+key);
            if(dataUrl.length>12*1024*1024)throw new Error("Image de map trop volumineuse : "+key);
            await mapEditorPutAsset(key,dataUrl);
        }

        const data=normalizeMapEditorMap(raw);
        const errors=mapEditorValidate(data,data.tileDefinitions);
        if(errors.length)throw new Error(errors.join("\n"));
        for(const definition of data.tileDefinitions||[])if(definition.interactive)mapEditorRegisterInteractiveDefinition(definition);
        if(mapEditorMaps.some(m=>m.id===data.id))data.id=mapEditorNormalizeId(data.id+"-import","map-import");
        mapEditorMaps.push(data);mapEditorActiveId=data.id;mapEditorPersist();mapEditorApplyRuntime();mapEditorRender();mapEditorLoadRuntimeImages();
    });
}

function mapEditorCreateMap(){
    const name=prompt("Nom de la nouvelle map :","Nouvelle map");if(!name)return;
    let id=mapEditorNormalizeId(name,mapEditorUid("map"));
    while(mapEditorMaps.some(m=>m.id===id))id+="-2";
    const m=normalizeMapEditorMap({id,name,cols:30,rows:20,tileSize:16,tileset:["grass","tree"],layers:[{id:"terrain",name:"Terrain",visible:true,cells:Array(600).fill("grass")}],encounters:[],spawn:{x:15,y:10},objects:[]});
    mapEditorMaps.push(m);mapEditorActiveId=id;mapEditorPersist();mapEditorUndo=[];mapEditorRedo=[];mapEditorApplyRuntime();mapEditorCenterViewport();mapEditorRender();
}

function mapEditorDeleteMap(){
    if(mapEditorMaps.length<=1){showToast?.("Impossible","Il faut conserver au moins une map.");return;}
    const m=mapEditorCurrent();if(!m||!confirm("Supprimer « "+m.name+" » ?"))return;
    mapEditorMaps=mapEditorMaps.filter(x=>x.id!==m.id);mapEditorActiveId=mapEditorMaps[0].id;mapEditorPersist();mapEditorApplyRuntime();mapEditorCenterViewport();mapEditorRender();
}

function mapEditorDuplicateMap(){
    const m=mapEditorCurrent();if(!m)return;
    const copy=mapEditorClone(m);copy.id=mapEditorNormalizeId(m.id+"-copie",mapEditorUid("map"));copy.name=m.name+" (copie)";
    mapEditorMaps.push(copy);mapEditorActiveId=copy.id;mapEditorPersist();mapEditorApplyRuntime();mapEditorCenterViewport();mapEditorRender();
}

function mapEditorCanvasPointFromEvent(event){
    const canvas=document.getElementById("map-editor-canvas");
    if(!canvas)return null;
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    const scaleX=canvas.width/rect.width;
    const scaleY=canvas.height/rect.height;
    return {
        x:(event.clientX-rect.left)*scaleX,
        y:(event.clientY-rect.top)*scaleY
    };
}

function mapEditorMapPointFromEvent(event){
    const point=mapEditorCanvasPointFromEvent(event);
    const canvas=document.getElementById("map-editor-canvas");
    if(!point||!canvas)return null;
    const zoom=Number(canvas.dataset.zoom)||2;
    const panX=Number(canvas.dataset.panX)||0;
    const panY=Number(canvas.dataset.panY)||0;
    return {
        x:(point.x-canvas.width/2)/zoom+panX,
        y:(point.y-canvas.height/2)/zoom+panY
    };
}

function mapEditorCellFromEvent(event){
    const point=mapEditorMapPointFromEvent(event);
    const m=mapEditorCurrent();
    if(!point||!m)return null;
    return {col:Math.floor(point.x/m.tileSize),row:Math.floor(point.y/m.tileSize)};
}

function mapEditorCellIsInside(cell){
    const m=mapEditorCurrent();
    return !!m&&!!cell&&cell.col>=0&&cell.row>=0&&cell.col<m.cols&&cell.row<m.rows;
}

function mapEditorCenterViewport(){
    const canvas=document.getElementById("map-editor-canvas");
    const m=mapEditorCurrent();
    if(!canvas||!m)return;
    canvas.dataset.panX=String((m.cols*m.tileSize)/2);
    canvas.dataset.panY=String((m.rows*m.tileSize)/2);
}

function mapEditorPaintAt(event, pointerTool=null){
    const m=mapEditorCurrent();const layer=mapEditorTopLayer();if(!m||!layer)return;
    const cell=mapEditorCellFromEvent(event);if(!mapEditorCellIsInside(cell))return;
    const index=cell.row*m.cols+cell.col;
    const activeTool=pointerTool||mapEditorTool;
    const next=activeTool==="erase"?null:mapEditorSelectedTile;
    if(mapEditorMode==="configuration")return;
    if(activeTool==="spawn"){mapEditorPushUndo();m.spawn={x:cell.col,y:cell.row};mapEditorTool="paint";mapEditorSaveCurrent();mapEditorRender();return;}
    if(activeTool==="eyedropper"){mapEditorSelectedTile=layer.cells[index];mapEditorTool="paint";mapEditorRender();return;}
    if(activeTool==="fill"){
        mapEditorPushUndo();const target=layer.cells[index];const replacement=mapEditorSelectedTile;if(target!==replacement){for(let i=0;i<layer.cells.length;i++)if(layer.cells[i]===target)layer.cells[i]=replacement;}mapEditorTool="paint";mapEditorSaveCurrent();mapEditorRender();return;
    }
    if(next===null){
        const object=mapEditorGetInstanceAtCell(cell.col,cell.row);
        if(object){m.objects=m.objects.filter(o=>o.instanceId!==object.instanceId);mapEditorOpenedObjectIds.delete(object.instanceId);mapEditorSaveCurrent();mapEditorRender();return;}
        if(layer.cells[index]===undefined)return;
        layer.cells[index]=layer.id==="terrain"?(m.tileset[0]||"grass"):null;
    } else if(mapEditorIsInteractiveTile(next)){
        const definition=mapEditorFindInteractiveDefinition(next);
        if(definition)mapEditorCreateInteractiveInstance(definition,cell.col,cell.row);
        mapEditorSaveCurrent();mapEditorRender();mapEditorLoadRuntimeImages();return;
    } else {
        if(!m.tileset.includes(next))m.tileset.push(next);layer.cells[index]=next;
    }
    mapEditorSaveCurrent();mapEditorRender();
}

function mapEditorResize(){
    const m=mapEditorCurrent();if(!m)return;
    const cols=Math.max(1,Math.min(MAP_EDITOR_MAX_COLS,Number(prompt("Largeur (cases) :",m.cols))||m.cols));
    const rows=Math.max(1,Math.min(MAP_EDITOR_MAX_ROWS,Number(prompt("Hauteur (cases) :",m.rows))||m.rows));
    if(cols===m.cols&&rows===m.rows)return;
    mapEditorPushUndo();
    for(const layer of m.layers){const next=Array(cols*rows).fill(m.tileset[0]||"grass");for(let y=0;y<Math.min(rows,m.rows);y++)for(let x=0;x<Math.min(cols,m.cols);x++)next[y*cols+x]=layer.cells[y*m.cols+x];layer.cells=next;}
    m.cols=cols;m.rows=rows;m.spawn.x=Math.min(cols-1,m.spawn.x);m.spawn.y=Math.min(rows-1,m.spawn.y);
    m.objects=(m.objects||[]).filter(o=>o.x<cols&&o.y<rows);mapEditorSaveCurrent();mapEditorApplyRuntime();mapEditorRender();
}
function mapEditorAddLayer(){
    const m=mapEditorCurrent();if(!m)return;
    const name=prompt("Nom du nouveau calque :","Décor");if(!name)return;
    mapEditorPushUndo();m.layers.push({id:mapEditorNormalizeId(name,mapEditorUid("layer")),name,visible:true,cells:Array(m.cols*m.rows).fill(null)});mapEditorSaveCurrent();mapEditorRender();
}
function mapEditorOpenEncounterForm(){
    const m=mapEditorCurrent();if(!m)return;
    const first=m.encounters?.[0]||{id:mapEditorUid("enc"),name:"Zone de rencontres",chance:12,tiles:[mapEditorSelectedTile||"tall-grass"],monsters:[],minLevel:1,maxLevel:10};
    const monsterOptions=(state.contenu?.Monstres||[]).map(x=>String(x.Nom||"")).filter(Boolean);
    const tileOptions=mapEditorAllTiles().map(x=>'<option value="'+x.id+'" '+(first.tiles?.includes(x.id)?"selected":"")+'>'+x.name+'</option>').join("");
    const monsterRows=(first.monsters||[]).map((e,i)=>'<div class="me-loot-row"><select data-enc-monster="'+i+'">'+monsterOptions.map(n=>'<option '+(n===e.monsterId?"selected":"")+'>'+n+'</option>').join("")+'</select><input type="number" min="1" data-enc-weight="'+i+'" value="'+(e.weight??1)+'"><input type="number" min="1" data-enc-min="'+i+'" value="'+(e.minLevel??first.minLevel??1)+'"><input type="number" min="1" data-enc-max="'+i+'" value="'+(e.maxLevel??first.maxLevel??10)+'"><button type="button" data-enc-del="'+i+'">×</button></div>').join("");
    mapEditorDialog('<div class="map-editor-dialog"><h3>Table de rencontres</h3><label>Nom<input id="me-e-name" value="'+first.name+'"></label><label>Chance par déclenchement (%)<input id="me-e-chance" type="number" min="0" max="100" value="'+first.chance+'"></label><label>Cases autorisées (Ctrl/Cmd pour plusieurs)<select id="me-e-tiles" multiple>'+tileOptions+'</select></label><label>Niveau min<input id="me-e-min" type="number" min="1" value="'+first.minLevel+'"></label><label>Niveau max<input id="me-e-max" type="number" min="1" value="'+first.maxLevel+'"></label><h4>Monstres pondérés</h4><div id="me-e-monsters">'+monsterRows+'</div><button id="me-e-add" class="secondary-button">+ Monstre</button><div class="dev-form-actions"><button id="me-e-save" class="primary-button">Enregistrer</button><button id="me-e-cancel" class="secondary-button">Annuler</button></div></div>');
    const box=document.getElementById("me-e-monsters");
    document.getElementById("me-e-add").onclick=()=>{const i=box.children.length;const d=document.createElement("div");d.className="me-loot-row";d.innerHTML='<select data-enc-monster="'+i+'">'+monsterOptions.map(n=>'<option>'+n+'</option>').join("")+'</select><input type="number" min="1" data-enc-weight="'+i+'" value="1"><input type="number" min="1" data-enc-min="'+i+'" value="'+first.minLevel+'"><input type="number" min="1" data-enc-max="'+i+'" value="'+first.maxLevel+'"><button type="button">×</button>';d.querySelector("button").onclick=()=>d.remove();box.appendChild(d);};
    box.querySelectorAll("button[data-enc-del]").forEach(b=>b.onclick=()=>b.parentElement.remove());
    document.getElementById("me-e-cancel").onclick=mapEditorCloseDialog;
    document.getElementById("me-e-save").onclick=()=>{
        const selected=[...document.getElementById("me-e-tiles").selectedOptions].map(x=>x.value);
        const m2=mapEditorCurrent();m2.encounters=Array.isArray(m2.encounters)?m2.encounters:[];
        let target=m2.encounters.find(x=>x.id===first.id);if(!target){target=mapEditorClone(first);m2.encounters.push(target);}
        target.name=document.getElementById("me-e-name").value||"Rencontres";target.chance=Number(document.getElementById("me-e-chance").value)||0;target.tiles=selected;target.minLevel=Math.max(1,Number(document.getElementById("me-e-min").value)||1);target.maxLevel=Math.max(target.minLevel,Number(document.getElementById("me-e-max").value)||target.minLevel);
        target.monsters=[...box.children].map(row=>({monsterId:row.querySelector("[data-enc-monster]")?.value,weight:Number(row.querySelector("[data-enc-weight]")?.value)||0,minLevel:Number(row.querySelector("[data-enc-min]")?.value)||target.minLevel,maxLevel:Number(row.querySelector("[data-enc-max]")?.value)||target.maxLevel})).filter(x=>x.monsterId&&x.weight>0);
        mapEditorSaveCurrent();mapEditorCloseDialog();
    };
}

function mapEditorRenderList(){
    const list=document.getElementById("map-editor-list");if(!list)return;
    list.innerHTML=mapEditorMaps.map(m=>`<button type="button" class="secondary-button map-editor-map-item ${m.id===mapEditorActiveId?"active":""}" data-map-id="${m.id}">${m.name} <small>${m.cols}×${m.rows}</small></button>`).join("");
    list.querySelectorAll("[data-map-id]").forEach(b=>b.onclick=()=>{
        mapEditorActiveId=b.dataset.mapId;
        mapEditorUndo=[];mapEditorRedo=[];
        mapEditorApplyRuntime();
        mapEditorCenterViewport();
        mapEditorRender();
        mapEditorRenderList();
    });
}

function mapEditorCountTileUsage(tileId){
    const id=String(tileId);
    let count=0;
    for(const m of mapEditorMaps){
        for(const layer of m.layers||[])for(const cell of layer.cells||[])if(String(cell??"")===id)count++;
        for(const object of m.objects||[])if(String(object.definitionId||"")===id)count++;
    }
    return count;
}

function mapEditorRemoveTileDefinition(tileId){
    const id=String(tileId||"");
    if(!id||id===MAP_EDITOR_EMPTY_TILE_ID)return false;

    const usage=mapEditorCountTileUsage(id);
    if(usage>0){
        const confirmed=window.confirm(
            "Cette tuile est actuellement utilisée sur la map.\n\n"+
            "Elle est présente sur "+usage+" cases.\n\n"+
            "Voulez-vous vraiment supprimer cette tuile ?\n\n"+
            "Les occurrences seront remplacées par VIDE."
        );
        if(!confirmed)return false;
    }

    for(const m of mapEditorMaps){
        for(const layer of m.layers||[]){
            layer.cells=(layer.cells||[]).map(cell=>String(cell??"")===id?MAP_EDITOR_EMPTY_TILE_ID:(cell===null||cell===undefined||cell===""?MAP_EDITOR_EMPTY_TILE_ID:cell));
        }
        if(Array.isArray(m.tileset))m.tileset=m.tileset.filter(tile=>String(tile)!==id&&String(tile)!==MAP_EDITOR_EMPTY_TILE_ID);
        m.tileset=[...new Set([...(m.tileset||[]),MAP_EDITOR_EMPTY_TILE_ID])];
        if(Array.isArray(m.encounters)){
            m.encounters=m.encounters.map(encounter=>Object.assign({},encounter,{tiles:(encounter.tiles||[]).filter(tile=>String(tile)!==id)})).filter(encounter=>(encounter.tiles||[]).length>0);
        }
        if(Array.isArray(m.objects)){
            m.objects=m.objects.filter(object=>{
                if(String(object.definitionId||"")!==id)return true;
                mapEditorOpenedObjectIds.delete(object.instanceId||object.id);
                return false;
            });
        }
        if(Array.isArray(m.tileDefinitions))m.tileDefinitions=m.tileDefinitions.filter(tile=>String(tile?.id||"")!==id);
    }
    mapEditorInteractiveDefinitions=mapEditorInteractiveDefinitions.filter(tile=>String(tile?.id||"")!==id);
    mapEditorPersistInteractiveDefinitions();
    mapEditorSelectedTile=null;
    mapEditorSelectedInstanceId=null;
    mapEditorHoveredInstanceId=null;
    for(const m of mapEditorMaps)mapEditorNormalizeMapTileReferences(m);
    mapEditorSaveCurrent();
    mapEditorPersist();
    mapEditorApplyRuntime();
    mapEditorRenderTiles();
    mapEditorRender();
    mapEditorLoadRuntimeImages();
    return true;
}

function mapEditorCanDeleteTile(tileId){
    const id=String(tileId||"");
    return id!==MAP_EDITOR_EMPTY_TILE_ID && !MAP_EDITOR_DEFAULT_TILES.some(tile=>tile.id===id);
}

function mapEditorRequestTileDeletion(tileId){
    const tile=mapEditorFindTileDefinition(tileId);
    if(!tile||!mapEditorCanDeleteTile(tile.id))return false;
    return mapEditorRemoveTileDefinition(tile.id);
}

function mapEditorRenderTiles(){
    const list=document.getElementById("map-editor-tiles");if(!list)return;
    list.innerHTML=mapEditorAllTiles().map(t=>'<div class="map-editor-tile-entry"><button type="button" class="map-editor-tile '+(mapEditorSelectedTile===t.id?"selected":"")+'" data-tile="'+t.id+'"><span style="background:'+(t.fallback||"#777")+'"></span>'+t.name+'</button>'+(mapEditorCanDeleteTile(t.id)?'<button type="button" class="map-editor-tile-delete" data-delete-tile="'+t.id+'" title="Supprimer cette tuile" aria-label="Supprimer '+t.name+'">×</button>':"")+'</div>').join("");
    list.querySelectorAll("[data-tile]").forEach(b=>b.onclick=()=>{mapEditorSelectedTile=b.dataset.tile;mapEditorTool="paint";mapEditorRenderTiles();mapEditorRender();});
    list.querySelectorAll("[data-delete-tile]").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();mapEditorRequestTileDeletion(b.dataset.deleteTile);});
}

function mapEditorOpenTileForm(existing=null){
    const t=existing||{id:"",name:"",collision:false,terrainType:"grass",encounters:false,description:"",fallback:"#8fbf6a",imageKey:null};
    const html='<div class="map-editor-dialog"><h3>'+(existing?"Modifier":"Créer")+' une tuile</h3>'+
    '<label>ID<input id="me-t-id" value="'+(t.id||"")+'" placeholder="ex: chemin"></label>'+
    '<label>Nom<input id="me-t-name" value="'+(t.name||"")+'"></label>'+
    '<label>Type de terrain<select id="me-t-terrain"><option>grass</option><option>water</option><option>sand</option><option>road</option><option>obstacle</option></select></label>'+
    '<label><input type="checkbox" id="me-t-collision" '+(t.collision?"checked":"")+'> Collision</label>'+
    '<label><input type="checkbox" id="me-t-encounters" '+(t.encounters?"checked":"")+'> Autoriser les rencontres</label>'+
    '<label>Couleur de secours<input type="color" id="me-t-fallback" value="'+(t.fallback||"#8fbf6a")+'"></label>'+
    '<label>Description<textarea id="me-t-desc">'+(t.description||"")+'</textarea></label>'+
    '<label>Image PNG/JPG<input type="file" id="me-t-image" accept="image/png,image/jpeg"></label>'+
    '<div class="dev-form-actions"><button id="me-t-save" class="primary-button">Enregistrer</button><button id="me-t-cancel" class="secondary-button">Annuler</button></div></div>';
    mapEditorDialog(html);
    document.getElementById("me-t-cancel").onclick=mapEditorCloseDialog;
    document.getElementById("me-t-save").onclick=async()=>{
        try{
            const id=mapEditorNormalizeId(document.getElementById("me-t-id").value,"tile");
            const name=document.getElementById("me-t-name").value.trim()||id;
            if(!/^[a-z0-9_-]+$/.test(id))throw new Error("ID invalide.");
            const m=mapEditorCurrent();m.tileDefinitions=Array.isArray(m.tileDefinitions)?m.tileDefinitions:[];
            let target=m.tileDefinitions.find(x=>x.id===id);
            if(!target){target={id};m.tileDefinitions.push(target);}
            Object.assign(target,{id,name,collision:document.getElementById("me-t-collision").checked,terrainType:document.getElementById("me-t-terrain").value,encounters:document.getElementById("me-t-encounters").checked,fallback:document.getElementById("me-t-fallback").value,description:document.getElementById("me-t-desc").value});
            const file=document.getElementById("me-t-image").files[0];if(file){const a=await mapEditorImportImage(file);target.imageKey=a.key;}
            if(!m.tileset.includes(id))m.tileset.push(id);
            mapEditorSaveCurrent();mapEditorCloseDialog();mapEditorRenderTiles();mapEditorRender();mapEditorLoadRuntimeImages();
        }catch(e){alert(e.message);}
    };
}

function mapEditorOpenInteractiveTileForm(existing=null){
    const d=mapEditorNormalizeInteractiveDefinition(existing||{
        id:mapEditorUid("interactive"),
        name:"Coffre en bois",
        kind:"container",
        collision:true,
        fallback:"#b9823d",
        interactive:{type:"container",collision:true,closedImageKey:null,openImageKey:null,lootTable:[],initialOpen:false}
    });
    const rows=(d.interactive.lootTable||[]).map((e,i)=>'<div class="me-loot-row"><select data-loot-item="'+i+'">'+getMapEditorItemCatalog().map(x=>'<option value="'+x.id+'" '+(x.id===e.itemId?"selected":"")+'>'+x.label+'</option>').join("")+'</select><input type="number" min="0" max="100" data-loot-chance="'+i+'" value="'+(e.chance??100)+'"><input type="number" min="1" data-loot-min="'+i+'" value="'+(e.min??1)+'"><input type="number" min="1" data-loot-max="'+i+'" value="'+(e.max??1)+'"><button type="button" data-loot-del="'+i+'">×</button></div>').join("");
    const html='<div class="map-editor-dialog"><h3>'+(existing?"Modifier":"Créer")+' une tuile interactive</h3><p class="map-editor-config-note">La définition est réutilisable. Chaque placement aura ensuite sa propre instance.</p><label>ID<input id="me-i-id" value="'+d.id+'"></label><label>Nom<input id="me-i-name" value="'+d.name+'"></label><label>Type<select id="me-i-kind"><option value="container" '+(d.kind==="container"?"selected":"")+'>Coffre / conteneur</option></select></label><label><input id="me-i-collision" type="checkbox" '+(d.collision!==false?"checked":"")+'> Collision par défaut</label><label>Image fermée PNG/JPG<input id="me-i-closed" type="file" accept="image/png,image/jpeg"></label><label>Image ouverte PNG/JPG<input id="me-i-open" type="file" accept="image/png,image/jpeg"></label><label><input id="me-i-opened" type="checkbox" '+(d.interactive.initialOpen?"checked":"")+'> État initial ouvert</label><h4>Table de butin par défaut</h4><div id="me-i-loot">'+rows+'</div><button type="button" id="me-i-loot-add" class="secondary-button">+ Récompense</button><div class="dev-form-actions"><button id="me-i-save" class="primary-button">Enregistrer</button><button id="me-i-cancel" class="secondary-button">Annuler</button></div></div>';
    mapEditorDialog(html);
    const loot=document.getElementById("me-i-loot");
    document.getElementById("me-i-loot-add").onclick=()=>{const index=loot.children.length;const div=document.createElement("div");div.className="me-loot-row";div.innerHTML='<select data-loot-item="'+index+'">'+getMapEditorItemCatalog().map(x=>'<option value="'+x.id+'">'+x.label+'</option>').join("")+'</select><input type="number" min="0" max="100" data-loot-chance="'+index+'" value="100"><input type="number" min="1" data-loot-min="'+index+'" value="1"><input type="number" min="1" data-loot-max="'+index+'" value="1"><button type="button">×</button>';div.querySelector("button").onclick=()=>div.remove();loot.appendChild(div);};
    loot.querySelectorAll("button[data-loot-del]").forEach(b=>b.onclick=()=>b.parentElement.remove());
    document.getElementById("me-i-cancel").onclick=mapEditorCloseDialog;
    document.getElementById("me-i-save").onclick=async()=>{
        try{
            const definition=mapEditorNormalizeInteractiveDefinition({
                id:mapEditorNormalizeId(document.getElementById("me-i-id").value,d.id),
                name:document.getElementById("me-i-name").value,
                kind:document.getElementById("me-i-kind").value,
                collision:document.getElementById("me-i-collision").checked,
                interactive:{
                    type:document.getElementById("me-i-kind").value,
                    collision:document.getElementById("me-i-collision").checked,
                    closedImageKey:d.interactive.closedImageKey,
                    openImageKey:d.interactive.openImageKey,
                    initialOpen:document.getElementById("me-i-opened").checked,
                    lootTable:[...loot.children].map(row=>({itemId:row.querySelector("[data-loot-item]")?.value,chance:Number(row.querySelector("[data-loot-chance]")?.value)||0,min:Number(row.querySelector("[data-loot-min]")?.value)||1,max:Number(row.querySelector("[data-loot-max]")?.value)||1})).filter(x=>x.itemId)
                }
            });
            const closedFile=document.getElementById("me-i-closed").files[0],openFile=document.getElementById("me-i-open").files[0];
            if(closedFile)definition.interactive.closedImageKey=(await mapEditorImportImage(closedFile)).key;
            if(openFile)definition.interactive.openImageKey=(await mapEditorImportImage(openFile)).key;
            definition.imageKey=definition.interactive.closedImageKey||definition.imageKey||null;
            mapEditorRegisterInteractiveDefinition(definition);
            const m=mapEditorCurrent();
            mapEditorEnsureInteractiveDefinitionInMap(m,definition);
            mapEditorSaveCurrent();mapEditorCloseDialog();mapEditorRenderTiles();mapEditorRender();mapEditorLoadRuntimeImages();
        }catch(e){alert(e.message);}
    };
}

function mapEditorSelectInstanceAt(col,row){
    const instance=mapEditorGetInstanceAtCell(col,row);
    mapEditorSelectedInstanceId=instance?.instanceId||null;
    mapEditorHoveredInstanceId=instance?.instanceId||null;
    mapEditorRender();
    if(instance)mapEditorOpenInstanceConfig(instance);
}

async function mapEditorFillConfigImagePreview(elementId,key){
    const element=document.getElementById(elementId);
    if(!element)return;
    if(!key){
        element.textContent="Rien";
        return;
    }
    element.textContent=String(key);
    const data=await mapEditorGetAsset(key);
    const current=document.getElementById(elementId);
    if(!current||!data)return;
    current.innerHTML='<span class="me-config-image-value">'+escapeHtml(String(key))+'</span><img class="me-config-image-preview" src="'+escapeHtml(data)+'" alt="Aperçu de l’image">';
}

function mapEditorOpenInstanceConfig(instance){
    const m=mapEditorCurrent();if(!m||!instance)return;
    const props=mapEditorGetInstanceProps(instance);
    const rows=(props.lootTable||[]).map((e,i)=>'<div class="me-loot-row"><select data-override-loot-item="'+i+'">'+getMapEditorItemCatalog().map(x=>'<option value="'+x.id+'" '+(x.id===e.itemId?"selected":"")+'>'+x.label+'</option>').join("")+'</select><input type="number" min="0" max="100" data-override-loot-chance="'+i+'" value="'+(e.chance??100)+'"><input type="number" min="1" data-override-loot-min="'+i+'" value="'+(e.min??1)+'"><input type="number" min="1" data-override-loot-max="'+i+'" value="'+(e.max??1)+'"><button type="button" data-override-loot-del="'+i+'">×</button></div>').join("");
    const html='<div class="map-editor-dialog"><h3>Configuration de l’instance</h3><p class="map-editor-config-note">Seule cette instance est modifiée. La définition globale reste inchangée.</p><label>ID instance<input id="me-o-id" value="'+instance.instanceId+'" readonly></label><label>Type<input value="'+(mapEditorGetInstanceDefinition(instance)?.name||instance.type)+'" readonly></label><label>X<input id="me-o-x" type="number" min="0" max="'+(m.cols-1)+'" value="'+instance.x+'"></label><label>Y<input id="me-o-y" type="number" min="0" max="'+(m.rows-1)+'" value="'+instance.y+'"></label><label><input id="me-o-collision" type="checkbox" '+(props.collision!==false?"checked":"")+'> Collision override</label><label><input id="me-o-use-custom-images" type="checkbox" '+((instance.overrides.closedImageKey||instance.overrides.openImageKey)?"checked":"")+'> Images propres à cette instance</label><div class="me-config-image-field"><strong>Image fermée</strong><div id="me-o-closed-current" class="me-config-image-value">Rien</div></div><label>Remplacer l’image fermée PNG/JPG<input id="me-o-closed" type="file" accept="image/png,image/jpeg"></label><div class="me-config-image-field"><strong>Image ouverte</strong><div id="me-o-open-current" class="me-config-image-value">Rien</div></div><label>Remplacer l’image ouverte PNG/JPG<input id="me-o-open" type="file" accept="image/png,image/jpeg"></label><h4>Loot de cette instance</h4><div id="me-o-loot">'+rows+'</div><button type="button" id="me-o-loot-add" class="secondary-button">+ Récompense</button><div class="dev-form-actions"><button id="me-o-save" class="primary-button">Appliquer</button><button id="me-o-reset" class="secondary-button">Réinitialiser les overrides</button><button id="me-o-cancel" class="secondary-button">Annuler</button></div></div>';
    mapEditorDialog(html);
    mapEditorFillConfigImagePreview("me-o-closed-current",props.closedImageKey);
    mapEditorFillConfigImagePreview("me-o-open-current",props.openImageKey);
    const loot=document.getElementById("me-o-loot");
    document.getElementById("me-o-loot-add").onclick=()=>{const index=loot.children.length;const div=document.createElement("div");div.className="me-loot-row";div.innerHTML='<select data-override-loot-item="'+index+'">'+getMapEditorItemCatalog().map(x=>'<option value="'+x.id+'">'+x.label+'</option>').join("")+'</select><input type="number" min="0" max="100" data-override-loot-chance="'+index+'" value="100"><input type="number" min="1" data-override-loot-min="'+index+'" value="1"><input type="number" min="1" data-override-loot-max="'+index+'" value="1"><button type="button">×</button>';div.querySelector("button").onclick=()=>div.remove();loot.appendChild(div);};
    loot.querySelectorAll("button[data-override-loot-del]").forEach(b=>b.onclick=()=>b.parentElement.remove());
    document.getElementById("me-o-cancel").onclick=mapEditorCloseDialog;
    document.getElementById("me-o-reset").onclick=()=>{instance.overrides={};mapEditorSaveCurrent();mapEditorCloseDialog();mapEditorRender();};
    document.getElementById("me-o-save").onclick=async()=>{
        try{
            const useCustom=document.getElementById("me-o-use-custom-images").checked;
            const overrides={
                collision:document.getElementById("me-o-collision").checked,
                lootTable:[...loot.children].map(row=>({itemId:row.querySelector("[data-override-loot-item]")?.value,chance:Number(row.querySelector("[data-override-loot-chance]")?.value)||0,min:Number(row.querySelector("[data-override-loot-min]")?.value)||1,max:Number(row.querySelector("[data-override-loot-max]")?.value)||1})).filter(x=>x.itemId)
            };
            if(useCustom){
                const closed=document.getElementById("me-o-closed").files[0],open=document.getElementById("me-o-open").files[0];
                if(instance.overrides.closedImageKey)overrides.closedImageKey=instance.overrides.closedImageKey;
                if(instance.overrides.openImageKey)overrides.openImageKey=instance.overrides.openImageKey;
                if(closed)overrides.closedImageKey=(await mapEditorImportImage(closed)).key;
                if(open)overrides.openImageKey=(await mapEditorImportImage(open)).key;
            }else{
                delete overrides.closedImageKey;delete overrides.openImageKey;
            }
            instance.x=Math.max(0,Math.min(m.cols-1,Math.floor(Number(document.getElementById("me-o-x").value)||0)));
            instance.y=Math.max(0,Math.min(m.rows-1,Math.floor(Number(document.getElementById("me-o-y").value)||0)));
            instance.overrides=overrides;
            mapEditorSaveCurrent();mapEditorCloseDialog();mapEditorRender();mapEditorLoadRuntimeImages();
        }catch(e){alert(e.message);}
    };
}

function mapEditorDialog(inner){
    let d=document.getElementById("map-editor-dialog");if(!d){d=document.createElement("div");d.id="map-editor-dialog";document.body.appendChild(d);}
    d.className="map-editor-dialog-wrap";d.innerHTML=inner;
}
function mapEditorCloseDialog(){const d=document.getElementById("map-editor-dialog");if(d)d.remove();}

function mapEditorRender(){
    const layerSelect=document.getElementById("me-layer-select"),cm=mapEditorCurrent();
    if(layerSelect&&cm){
        layerSelect.innerHTML=(cm.layers||[]).map(l=>'<option value="'+l.id+'" '+(l.id===mapEditorActiveLayerId?"selected":"")+'>'+l.name+'</option>').join("");
        layerSelect.onchange=()=>{mapEditorActiveLayerId=layerSelect.value;mapEditorRender();};
    }
    const root=document.getElementById("map-editor-root");if(!root)return;
    mapEditorRenderList();mapEditorRenderTiles();
    const modePlacement=document.getElementById("me-mode-placement"),modeConfig=document.getElementById("me-mode-config");
    if(modePlacement)modePlacement.classList.toggle("active",mapEditorMode==="placement");
    if(modeConfig)modeConfig.classList.toggle("active",mapEditorMode==="configuration");
    const m=mapEditorCurrent(),canvas=document.getElementById("map-editor-canvas");if(!m||!canvas)return;
    const ctx=canvas.getContext("2d"),zoom=Number(canvas.dataset.zoom)||2,panX=Number(canvas.dataset.panX)||0,panY=Number(canvas.dataset.panY)||0;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(canvas.width/2-panX*zoom,canvas.height/2-panY*zoom);ctx.scale(zoom,zoom);
    const layer=mapEditorTopLayer();
    for(let y=0;y<m.rows;y++)for(let x=0;x<m.cols;x++){
        const id=layer.cells[y*m.cols+x],t=mapEditorFindTile(id);
        ctx.fillStyle=t.fallback||"#777";ctx.fillRect(x*m.tileSize,y*m.tileSize,m.tileSize,m.tileSize);
        const img=t.imageKey?mapEditorRuntimeImages.get(t.imageKey):null;if(img)ctx.drawImage(img,x*m.tileSize,y*m.tileSize,m.tileSize,m.tileSize);
        if(mapEditorSelectedTile===id&&mapEditorMode==="placement"){ctx.strokeStyle="#fff";ctx.lineWidth=1/zoom;ctx.strokeRect(x*m.tileSize+.5,y*m.tileSize+.5,m.tileSize-1,m.tileSize-1);}
    }
    ctx.strokeStyle="rgba(255,255,255,.18)";ctx.lineWidth=1/zoom;
    for(let x=0;x<=m.cols;x++){ctx.beginPath();ctx.moveTo(x*m.tileSize,0);ctx.lineTo(x*m.tileSize,m.rows*m.tileSize);ctx.stroke();}
    for(let y=0;y<=m.rows;y++){ctx.beginPath();ctx.moveTo(0,y*m.tileSize);ctx.lineTo(m.cols*m.tileSize,y*m.tileSize);ctx.stroke();}
    ctx.fillStyle="#ffd54a";ctx.fillRect(m.spawn.x*m.tileSize+m.tileSize*.25,m.spawn.y*m.tileSize+m.tileSize*.25,m.tileSize*.5,m.tileSize*.5);
    for(const o of m.objects||[]){
        const props=mapEditorGetInstanceProps(o);
        const opened=mapEditorOpenedObjectIds.has(o.instanceId)||o.state?.opened===true;
        const key=mapEditorGetEffectiveInstanceImage(o,opened);
        const img=key?mapEditorRuntimeImages.get(key):null;
        const x=o.x*m.tileSize,y=o.y*m.tileSize;
        if(img&&img.complete)ctx.drawImage(img,x,y,m.tileSize,m.tileSize);
        else {ctx.fillStyle=opened?"#654b2d":"#b87b3d";ctx.fillRect(x+2,y+2,m.tileSize-4,m.tileSize-4);ctx.fillStyle="#e0b34f";ctx.fillRect(x+m.tileSize*.42,y+m.tileSize*.44,m.tileSize*.16,m.tileSize*.18);}
        if(mapEditorMode==="configuration"&&(o.instanceId===mapEditorSelectedInstanceId||o.instanceId===mapEditorHoveredInstanceId)){
            ctx.strokeStyle=o.instanceId===mapEditorSelectedInstanceId?"#ffd54a":"#fff";ctx.lineWidth=2/zoom;ctx.strokeRect(x+.5,y+.5,m.tileSize-1,m.tileSize-1);
        }
    }
    ctx.restore();
    const name=root.querySelector("#map-editor-current-name");if(name)name.textContent=m.name+" · "+m.cols+"×"+m.rows;
    const hint=root.querySelector(".map-editor-hint");
    if(hint)hint.textContent=mapEditorMode==="configuration"?"Configuration : survolez puis cliquez une instance · coordonnées dans le panneau · clic molette : déplacer":"Clic gauche : placer · clic droit : effacer · glisser : peindre · molette : zoom · clic molette : déplacer";
}

function mapEditorBuildUi(){
    if(document.getElementById("map-editor-root"))return;
    const wrap=document.createElement("div");wrap.id="map-editor-root";wrap.className="save-menu map-editor-shell hidden";
    wrap.innerHTML='<div class="save-menu-content map-editor-content"><div class="save-menu-header"><div><span class="eyebrow">OUTIL DÉVELOPPEUR</span><h2>Créateur de Map</h2><p id="map-editor-current-name"></p></div><button id="map-editor-close" class="close-button">×</button></div><div class="map-editor-toolbar"><button id="me-new" class="primary-button">Nouvelle</button><button id="me-dup" class="secondary-button">Dupliquer</button><button id="me-del" class="secondary-button">Supprimer</button><button id="me-import" class="secondary-button">Importer JSON</button><button id="me-export" class="secondary-button">Exporter JSON</button><button id="me-undo" class="secondary-button">↶</button><button id="me-redo" class="secondary-button">↷</button><button id="me-test" class="secondary-button">Tester</button><button id="me-resize" class="secondary-button">Dimensions</button><select id="me-layer-select" title="Calque actif"></select><button id="me-layer" class="secondary-button">+ Calque</button><button id="me-encounter" class="secondary-button">Rencontres</button><button id="me-mode-placement" class="secondary-button">Placement</button><button id="me-mode-config" class="secondary-button">Configuration</button></div><div class="map-editor-layout"><aside><h3>Maps</h3><div id="map-editor-list"></div><h3>Tuiles</h3><div id="map-editor-tiles"></div><button id="me-new-tile" class="secondary-button">+ Tuile</button><button id="me-chest" class="secondary-button">+ Tuile interactive</button><h3>Outils</h3><div class="map-editor-tools"><button data-tool="paint">Pinceau</button><button data-tool="erase">Gomme</button><button data-tool="eyedropper">Pipette</button><button data-tool="fill">Remplir</button><button data-tool="spawn">Spawn</button></div></aside><main><canvas id="map-editor-canvas" width="1100" height="650" data-zoom="2" data-pan-x="0" data-pan-y="0"></canvas><div class="map-editor-hint">Clic gauche : placer · clic droit : effacer · glisser : peindre · molette : zoom · clic molette : déplacer</div></main></div><input id="map-editor-import-file" type="file" accept=".json,application/json" hidden></div>';
    document.body.appendChild(wrap);
    document.getElementById("map-editor-close").onclick=mapEditorClose;
    document.getElementById("me-new").onclick=mapEditorCreateMap;document.getElementById("me-dup").onclick=mapEditorDuplicateMap;document.getElementById("me-del").onclick=mapEditorDeleteMap;document.getElementById("me-import").onclick=()=>document.getElementById("map-editor-import-file").click();document.getElementById("me-export").onclick=mapEditorExport;document.getElementById("me-undo").onclick=mapEditorUndoAction;document.getElementById("me-redo").onclick=mapEditorRedoAction;
    document.getElementById("me-resize").onclick=mapEditorResize;document.getElementById("me-layer").onclick=mapEditorAddLayer;document.getElementById("me-encounter").onclick=mapEditorOpenEncounterForm;
    document.getElementById("me-test").onclick=()=>{
        mapEditorTestMode=true;
        mapEditorTestSnapshot={map:mapEditorClone(mapEditorCurrent()),opened:new Set(mapEditorOpenedObjectIds)};
        const r=document.getElementById("map-editor-root");if(r)r.classList.add("hidden");
        if(typeof startOverworldMode==="function")startOverworldMode();
    };
    document.getElementById("me-new-tile").onclick=()=>mapEditorOpenTileForm();
    document.getElementById("me-chest").onclick=()=>mapEditorOpenInteractiveTileForm();
    document.getElementById("me-mode-placement").onclick=()=>{mapEditorMode="placement";mapEditorSelectedInstanceId=null;mapEditorRender();};
    document.getElementById("me-mode-config").onclick=()=>{mapEditorMode="configuration";mapEditorSelectedTile=null;mapEditorRender();};
    document.querySelectorAll(".map-editor-tools [data-tool]").forEach(b=>b.onclick=()=>{mapEditorTool=b.dataset.tool;mapEditorMode="placement";mapEditorRender();});
    document.getElementById("map-editor-import-file").onchange=e=>{const f=e.target.files[0];if(f)mapEditorImport(f).catch(err=>alert(err.message));e.target.value="";};
    const canvas=document.getElementById("map-editor-canvas");
    canvas.oncontextmenu=e=>e.preventDefault();

    canvas.onpointerdown=e=>{
        if(e.button!==0&&e.button!==1&&e.button!==2)return;
        e.preventDefault();
        try{canvas.setPointerCapture(e.pointerId);}catch(_){}
        const cell=mapEditorCellFromEvent(e);
        const inside=mapEditorCellIsInside(cell);
        mapEditorDragging=false;mapEditorPan=null;mapEditorPointerMode=null;mapEditorPointerTool=null;

        if(e.button===1){
            mapEditorPointerMode="pan";
        }else if(e.button===2){
            if(mapEditorMode==="placement"){
                mapEditorPointerMode="erase";mapEditorPointerTool="erase";
                if(inside)mapEditorPushUndo();mapEditorDragging=inside;
                if(inside)mapEditorPaintAt(e,mapEditorPointerTool);
            }else{
                mapEditorPointerMode="pan";
            }
        }else if(e.button===0){
            if(mapEditorMode==="configuration"){
                if(inside)mapEditorSelectInstanceAt(cell.col,cell.row);
                else mapEditorPointerMode="pan";
            }else if(inside){
                mapEditorPointerMode="paint";mapEditorPointerTool=mapEditorTool;mapEditorPushUndo();mapEditorDragging=true;mapEditorPaintAt(e,mapEditorPointerTool);
            }else mapEditorPointerMode="pan";
        }

        if(mapEditorPointerMode==="pan"){
            const point=mapEditorCanvasPointFromEvent(e),zoom=Number(canvas.dataset.zoom)||2;
            if(point)mapEditorPan={x:point.x,y:point.y,px:Number(canvas.dataset.panX)||0,py:Number(canvas.dataset.panY)||0,zoom};
        }
    };

    canvas.onpointermove=e=>{
        const cell=mapEditorCellFromEvent(e),inside=mapEditorCellIsInside(cell);
        if(mapEditorMode==="configuration"&&mapEditorPointerMode!=="pan"){
            const next=inside?mapEditorGetInstanceAtCell(cell.col,cell.row):null;
            const nextId=next?.instanceId||null;
            if(nextId!==mapEditorHoveredInstanceId){mapEditorHoveredInstanceId=nextId;mapEditorRender();}
        }
        if(mapEditorPointerMode==="pan"&&mapEditorPan){
            const point=mapEditorCanvasPointFromEvent(e);if(!point)return;
            const z=mapEditorPan.zoom||Number(canvas.dataset.zoom)||2;
            canvas.dataset.panX=String(mapEditorPan.px+(point.x-mapEditorPan.x)/z);
            canvas.dataset.panY=String(mapEditorPan.py+(point.y-mapEditorPan.y)/z);
            mapEditorRender();return;
        }
        if(mapEditorPointerMode==="paint"&&mapEditorDragging&&inside){
            mapEditorPaintAt(e,mapEditorPointerTool);
        }
        if(mapEditorPointerMode==="erase"&&mapEditorDragging&&inside){
            mapEditorPaintAt(e,"erase");
        }
    };

    canvas.onpointerup=e=>{
        mapEditorDragging=false;mapEditorPointerMode=null;mapEditorPointerTool=null;mapEditorPan=null;
        try{canvas.releasePointerCapture(e.pointerId);}catch(_){}
    };
    canvas.onpointercancel=e=>{
        mapEditorDragging=false;mapEditorPointerMode=null;mapEditorPointerTool=null;mapEditorPan=null;
        try{canvas.releasePointerCapture(e.pointerId);}catch(_){}
    };
    canvas.onlostpointercapture=()=>{
        mapEditorDragging=false;mapEditorPointerMode=null;mapEditorPointerTool=null;mapEditorPan=null;
    };

    canvas.onwheel=e=>{
        e.preventDefault();
        const z=Math.max(.5,Math.min(6,(Number(canvas.dataset.zoom)||2)*(e.deltaY<0?1.1:.9)));
        canvas.dataset.zoom=z;
        mapEditorRender();
    };
}

function openMapEditor(){
    mapEditorBuildUi();if(typeof closeDevMenu==="function")closeDevMenu();document.getElementById("map-editor-root").classList.remove("hidden");mapEditorCenterViewport();mapEditorRender();mapEditorLoadRuntimeImages();
}
function mapEditorClose(){
    if(mapEditorTestMode){
        const m=mapEditorCurrent();
        if(m&&mapEditorTestSnapshot){const i=mapEditorMaps.findIndex(x=>x.id===m.id);if(i>=0)mapEditorMaps[i]=normalizeMapEditorMap(mapEditorTestSnapshot.map);mapEditorOpenedObjectIds=new Set(mapEditorTestSnapshot.opened);mapEditorPersist();mapEditorApplyRuntime();}
        mapEditorTestMode=false;mapEditorTestSnapshot=null;
        if(typeof stopOverworldMode==="function")stopOverworldMode();
        if(typeof openMapEditor==="function")openMapEditor();
        return;
    }
    const r=document.getElementById("map-editor-root");if(r)r.classList.add("hidden");
}
function mapEditorAddDevButton(){
    const main=document.getElementById("dev-menu-main");if(!main||document.getElementById("dev-cat-maps"))return;
    const b=document.createElement("button");b.id="dev-cat-maps";b.className="secondary-button";b.type="button";b.textContent="🗺 Créateur de Map";main.insertBefore(b,document.getElementById("dev-export-disk-btn"));b.onclick=openMapEditor;
}

document.addEventListener("DOMContentLoaded",()=>{
    mapEditorLoadInteractiveDefinitions();mapEditorLoadMaps();mapEditorApplyRuntime();mapEditorBuildUi();mapEditorAddDevButton();mapEditorLoadRuntimeImages();
    document.addEventListener("keydown",e=>{
        if(typeof isKeybindCaptureActive==="function"&&isKeybindCaptureActive()){e.preventDefault();e.stopPropagation();return;}
        if(e.key==="e"&&!document.getElementById("map-editor-root")?.classList.contains("hidden")&&document.activeElement?.tagName!=="INPUT"&&document.activeElement?.tagName!=="TEXTAREA")mapEditorInteract();
        if(e.key==="Escape"&&(mapEditorTestMode||!document.getElementById("map-editor-root")?.classList.contains("hidden"))){e.preventDefault();mapEditorClose();}
        if(typeof isWorldScreenActive==="function"&&isWorldScreenActive()&&!mapEditorTestMode&&typeof getKeyAction==="function"&&getKeyAction(e.key)==="confirm"){mapEditorInteract();}
    });
});

