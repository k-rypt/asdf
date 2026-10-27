"use client"

import { FormEvent, useState } from "react"
import { createClient } from "@/lib/supabase/client"

import { Button } from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import { Field, FieldGroup, FieldDescription } from "@/components/ui/field"
import { Input, } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"

// Icons
import { Plus, Info } from "lucide-react"

export function NewDepartment() {
    const [open, setOpen] = useState(false)
    const [empty, setIsEmpty] = useState(false)
    const supabase = createClient()

    async function handleSubmit(e: FormEvent<HTMLFormElement> ) {
        e.preventDefault()

        const formData = new FormData(e.currentTarget)
        const departmentName = formData.get("name") as string

        if (!departmentName) {
            setIsEmpty(true)
            return
        }

        // obtain currently logged-in user's ID 
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            alert("You must be logged in to perform this action")
            return
        }
        
        const { error: departmentError } = await supabase
        .from("departments")
        .insert({
            name: departmentName,
            created_by: user.id,
        })
        .select()

        // declare an error if insert returns an error
        if (departmentError) {
            // announce through console
            console.error("Error inserting capability:", departmentError)
            // announce through a toaster 
            toast.add({
                title: "Warning",
                description: "Failed to create department. " + departmentError.message,
                type: "warning"
            })
        } else {
            // announce successful insert via toaster
            toast.add({
                title: "Success",
                description: "Department created successfully!",
                type: "success"
            })
            // close dialog
            setOpen(false)
            // remove "empty input" state
            setIsEmpty(false)
        }   

    }

    return (
        <Dialog.Dialog open={open} onOpenChange={setOpen}>
            {/* Trigger to open the modal */}
            <Dialog.DialogTrigger render={
                <Button variant="default">
                    <Plus />
                    New Department
                </Button>
            } />

            {/* This modal should appear after clicking the fucking trigger */}
            <Dialog.DialogContent>
                <form onSubmit={handleSubmit}>
                     <Dialog.DialogHeader>
                        <Dialog.DialogTitle>Create a Department</Dialog.DialogTitle>
                    </Dialog.DialogHeader>
                    <br />
                    <FieldGroup>
                        <Field>
                            {/* if the input is empty and the user clicks the submit button, turn the setIsEmpty as true so that the invalid input will appear, however this should return back to normal once the user has typed into it*/}
                            {
                                empty == false ? (
                                    <>
                                        <Input id="name-1" name="name" placeholder="Name of Department" onChange={() => setIsEmpty(false)} />
                                        <FieldDescription>Name must be unique</FieldDescription>
                                    </>
                                 ) : (
                                    <>
                                        <Input id="name-1" name="name" placeholder="Name of Department" aria-invalid onChange={() => setIsEmpty(false)} />
                                        <FieldDescription className="text-destructive">
                                            <span className="flex items-center gap-1.5">
                                                <Info className="size-4" />
                                                Department name is required
                                            </span>
                                        </FieldDescription>
                                    </>
                                )
                            }
                        </Field>
                    </FieldGroup>
                    <br />
                    <Dialog.DialogFooter>
                        <Dialog.DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
                        <Button type="submit">Create Department</Button>
                    </Dialog.DialogFooter>
                </form>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    )
}