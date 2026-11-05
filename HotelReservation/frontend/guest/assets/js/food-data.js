"use strict";
(() => {
  // Approved UI fixtures only, not a live menu or quote. Stable IDs are shared
  // by menu/cart; historical submitted orders retain their own price snapshots.
  const items = [
    {id:"chicken-rice",name:"Cơm gà",category:"main",description:"Cơm dùng cùng thịt gà.",price:80000,unit:"phần",image:null},
    {id:"vegetable-noodles",name:"Mì xào rau củ",category:"main",description:"Món mì xào kết hợp rau củ.",price:65000,unit:"phần",image:null},
    {id:"egg-sandwich",name:"Sandwich trứng",category:"snack",description:"Sandwich dùng cùng trứng.",price:50000,unit:"phần",image:null},
    {id:"fries",name:"Khoai tây chiên",category:"snack",description:"Khoai tây chiên dùng như món ăn nhẹ.",price:40000,unit:"phần",image:null},
    {id:"orange-juice",name:"Nước cam",category:"drink",description:"Nước cam dùng kèm bữa ăn hoặc thưởng thức riêng.",price:35000,unit:"ly",image:null},
    {id:"water",name:"Nước suối",category:"drink",description:"Nước uống đóng chai.",price:15000,unit:"chai",image:null},
  ].map(Object.freeze);
  const categories=Object.freeze({all:"Tất cả",main:"Món chính",snack:"Món nhẹ",drink:"Đồ uống"});
  window.FoodCatalog=Object.freeze({items:Object.freeze(items),categories,find:id=>items.find(i=>i.id===id),
    stamp:()=>JSON.stringify(items.map(({id,name,price,unit})=>[id,name,price,unit]))});
})();
