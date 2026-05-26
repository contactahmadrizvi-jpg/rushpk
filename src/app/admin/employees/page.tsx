"use client";

import { useEffect, useState } from "react";
import { BaseRepository } from "@/services/base.repository";
import { COLLECTIONS } from "@/constants";
import type { Employee } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TableRowsSkeleton } from "@/components/ui/loading-skeletons";

const repo = new BaseRepository<Employee>(COLLECTIONS.employees);

export default function EmployeesPage() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", cnic: "", salary: "", role: "employee" });

  const load = async () => {
    setLoading(true);
    try {
      setEmployees(await repo.getAll());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Employees</h1>
        <div className="mt-6">
          <TableRowsSkeleton rows={6} />
        </div>
      </div>
    );
  }

  async function add() {
    const now = new Date().toISOString();
    await repo.create({
      name: form.name,
      email: form.email,
      phone: form.phone,
      cnic: form.cnic,
      role: form.role as Employee["role"],
      salary: Number(form.salary) || 0,
      shiftStart: "11:00",
      shiftEnd: "23:00",
      permissions: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as Omit<Employee, "id">);
    toast.success("Employee added");
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Employees</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input placeholder="CNIC" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
        <Button onClick={add}>Add Employee</Button>
      </div>
      <div className="mt-8 space-y-2">
        {employees.map((e) => (
          <div key={e.id} className="flex justify-between rounded-xl border p-4">
            <div><p className="font-bold">{e.name}</p><p className="text-sm text-muted-foreground">{e.role} • {e.phone}</p></div>
            <span className="text-sm">PKR {e.salary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
