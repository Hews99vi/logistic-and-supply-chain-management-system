begin;

alter table public.products
  add column if not exists wholesale_price numeric(12, 2),
  add column if not exists piece_margin numeric(12, 2);

-- Map the SKU from the product prices.pdf to populate prices
update public.products
set 
  distributor_price = case 
    when sku = '016' then 60.56
    when sku = '017' then 107.03
    when sku = '018' then 206.11
    when sku = '019' then 412.22
    when sku = '002' then 81.39
    when sku = '039' then 163.61
    when sku = '037' then 131.67
    when sku = '008' then 309.44
    when sku = '043' then 105.00
    when sku = '048' then 51.11
    when sku = '044' then 105.00
    when sku = '049' then 51.11
    when sku = '042' then 240.28
    when sku = '028' then 72.22
    when sku = '056' then 72.22
    when sku = '034' then 145.28
    when sku = '057' then 145.28
    when sku = '029' then 72.22
    when sku = '021' then 211.11
    when sku = '022' then 425.00
    when sku = '023' then 39.72
    when sku = '024' then 77.78
    when sku = '025' then 211.11
    when sku = '026' then 425.00
    when sku = '045' then 133.33
    when sku = '046' then 266.67
    when sku = '020' then 28.06
    when sku = '001' then 45.83
    when sku = '035' then 81.67
    when sku = '009' then 45.83
    when sku = '031' then 79.44
    when sku = '010' then 45.83
    when sku = '032' then 79.44
    when sku = '041' then 165.00
    when sku = '053' then 55.56
    when sku = '052' then 55.56
    when sku = '055' then 55.56
    when sku = '036' then 47.22
    when sku = '011' then 160.00
    when sku = '012' then 170.00
    when sku = '013' then 165.00
    when sku = '014' then 175.00
    when sku = '015' then 165.00
    else distributor_price
  end,
  wholesale_price = case 
    when sku = '016' then 65.46
    when sku = '017' then 115.70
    when sku = '018' then 222.82
    when sku = '019' then 445.64
    when sku = '002' then 87.99
    when sku = '039' then 176.88
    when sku = '037' then 142.34
    when sku = '008' then 334.54
    when sku = '043' then 113.51
    when sku = '048' then 55.26
    when sku = '044' then 113.51
    when sku = '049' then 55.26
    when sku = '042' then 259.76
    when sku = '028' then 78.08
    when sku = '056' then 78.08
    when sku = '034' then 157.06
    when sku = '057' then 157.06
    when sku = '029' then 78.08
    when sku = '021' then 228.23
    when sku = '022' then 459.46
    when sku = '023' then 42.94
    when sku = '024' then 84.08
    when sku = '025' then 228.23
    when sku = '026' then 459.46
    when sku = '045' then 144.14
    when sku = '046' then 288.29
    when sku = '020' then 30.33
    when sku = '001' then 49.55
    when sku = '035' then 88.29
    when sku = '009' then 49.55
    when sku = '031' then 85.89
    when sku = '010' then 49.55
    when sku = '032' then 85.89
    when sku = '041' then 178.38
    when sku = '053' then 60.06
    when sku = '052' then 60.06
    when sku = '055' then 60.06
    when sku = '036' then 51.05
    when sku = '011' then 172.97
    when sku = '012' then 183.78
    when sku = '013' then 178.38
    when sku = '014' then 189.19
    when sku = '015' then 178.38
    else wholesale_price
  end,
  piece_margin = case 
    when sku = '016' then 4.90
    when sku = '017' then 8.67
    when sku = '018' then 16.71
    when sku = '019' then 33.42
    when sku = '002' then 6.60
    when sku = '039' then 13.27
    when sku = '037' then 10.67
    when sku = '008' then 25.10
    when sku = '043' then 8.51
    when sku = '048' then 4.15
    when sku = '044' then 8.51
    when sku = '049' then 4.15
    when sku = '042' then 19.48
    when sku = '028' then 5.86
    when sku = '056' then 5.86
    when sku = '034' then 11.78
    when sku = '057' then 11.78
    when sku = '029' then 5.86
    when sku = '021' then 17.12
    when sku = '022' then 34.46
    when sku = '023' then 3.22
    when sku = '024' then 6.30
    when sku = '025' then 17.12
    when sku = '026' then 34.46
    when sku = '045' then 10.81
    when sku = '046' then 21.62
    when sku = '020' then 2.27
    when sku = '001' then 3.72
    when sku = '035' then 6.62
    when sku = '009' then 3.72
    when sku = '031' then 6.45
    when sku = '010' then 3.72
    when sku = '032' then 6.45
    when sku = '041' then 13.38
    when sku = '053' then 4.50
    when sku = '052' then 4.50
    when sku = '055' then 4.50
    when sku = '036' then 3.83
    when sku = '011' then 12.97
    when sku = '012' then 13.78
    when sku = '013' then 13.38
    when sku = '014' then 14.19
    when sku = '015' then 13.38
    else piece_margin
  end
where is_active = true;

commit;
