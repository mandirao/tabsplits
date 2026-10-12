import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_PICKER_OPTIONS } from "@/lib/categories";

export interface ItemFieldsValue {
  name: string;
  quantity: number;
  price: string;
  category?: string | null;
}

interface ItemEditFieldsProps {
  value: ItemFieldsValue;
  onChange: (value: ItemFieldsValue) => void;
  idPrefix: string;
  categoryTestidPrefix: string;
}

export default function ItemEditFields({ value, onChange, idPrefix, categoryTestidPrefix }: ItemEditFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Item Name</Label>
        <Input
          id={`${idPrefix}-name`}
          type="text"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="e.g. Caesar Salad"
          data-testid={`input-${idPrefix}-name`}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-quantity`}>Quantity</Label>
        <Input
          id={`${idPrefix}-quantity`}
          type="number"
          min="1"
          value={value.quantity}
          onChange={(e) => onChange({ ...value, quantity: parseInt(e.target.value) || 1 })}
          data-testid={`input-${idPrefix}-quantity`}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-price`}>Price</Label>
        <Input
          id={`${idPrefix}-price`}
          type="text"
          inputMode="decimal"
          value={value.price}
          onChange={(e) => onChange({ ...value, price: e.target.value })}
          placeholder="0.00"
          data-testid={`input-${idPrefix}-price`}
        />
      </div>
      <div className="space-y-2">
        <Label>Category</Label>
        <div className="flex gap-2 flex-wrap">
          {CATEGORY_PICKER_OPTIONS.map(({ value: catValue, label, Icon }) => {
            const selected = (value.category ?? null) === catValue;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onChange({ ...value, category: catValue })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors
                  ${selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover-elevate"
                  }`}
                data-testid={`button-${categoryTestidPrefix}-${catValue ?? "none"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
